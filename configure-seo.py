#!/usr/bin/env python3
"""Set Renju Master's real public URL. Python 3 standard library only.

Run from any directory:
    python configure-seo.py https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/

Only index.html, sitemap.xml and robots.txt beside this script are changed.
The URL is never guessed. Re-running with the same URL is safe.
"""

import argparse
import html
from html.parser import HTMLParser
import ipaddress
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import quote, unquote, urlsplit, urlunsplit
from xml.sax.saxutils import escape as xml_escape


def base_url(value):
    """Validate and normalize an HTTPS directory URL, preserving repo paths."""
    if not value or any(ch.isspace() or ord(ch) < 32 for ch in value):
        raise argparse.ArgumentTypeError('空白を含まないHTTPSの公開URLを指定してください。')
    if any(ch in value for ch in '\\<>"\''):
        raise argparse.ArgumentTypeError('URLに使用できない文字が含まれています。')
    if re.search(r'%(?![0-9a-fA-F]{2})', value):
        raise argparse.ArgumentTypeError('URLのパーセントエンコードが不正です。')
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError as error:
        raise argparse.ArgumentTypeError('URLの形式が不正です。') from error
    if parts.scheme.lower() != 'https' or not parts.hostname:
        raise argparse.ArgumentTypeError('https:// で始まる正式な公開URLを指定してください。')
    if parts.username is not None or parts.password is not None:
        raise argparse.ArgumentTypeError('ユーザー名・パスワードを含むURLは使えません。')
    if parts.query or parts.fragment or '?' in value or '#' in value:
        raise argparse.ArgumentTypeError('クエリや # を除いた、サイトの公開URLを指定してください。')
    try:
        hostname = parts.hostname.encode('idna').decode('ascii').lower()
    except UnicodeError as error:
        raise argparse.ArgumentTypeError('ホスト名が不正です。') from error
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        if len(hostname) > 253 or any(
            not label or len(label) > 63 or
            not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?', label)
            for label in hostname.split('.')
        ):
            raise argparse.ArgumentTypeError('ホスト名が不正です。')
    decoded_path = unquote(parts.path)
    if any(ch in decoded_path for ch in '\\<>"\'') or any(
        ord(ch) < 32 for ch in decoded_path
    ):
        raise argparse.ArgumentTypeError('URLのパスに使用できない文字が含まれています。')
    if any(segment in ('.', '..') for segment in decoded_path.split('/')):
        raise argparse.ArgumentTypeError('パスに . や .. を含めず、正式な公開URLを指定してください。')
    if re.search(r'(?i)\.(?:html?|xml|json|php|aspx?)$', decoded_path):
        raise argparse.ArgumentTypeError('index.html などを除いたフォルダーのURLを指定してください。')
    path = quote(parts.path or '/', safe="/%:@!$&()*+,;=-._~")
    if not path.endswith('/'):
        path += '/'
    host = '[' + hostname + ']' if ':' in hostname else hostname
    if port is not None and port != 443:
        host += ':' + str(port)
    return urlunsplit(('https', host, path, '', ''))


class TagAttrs(HTMLParser):
    def __init__(self, tag):
        super().__init__(convert_charrefs=True)
        self.attrs = {}
        self.feed(tag)

    def handle_starttag(self, tag, attrs):
        self.attrs = {key.lower(): value for key, value in attrs}

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def set_head_tag(source, tag, attribute, name, replacement):
    """Replace first matching head tag, remove duplicates, or insert in head."""
    used = False

    def update(match):
        nonlocal used
        if TagAttrs(match.group(0)).attrs.get(attribute, '').lower() != name.lower():
            return match.group(0)
        if used:
            return ''
        used = True
        return replacement

    head = re.search(r'<head\b[^>]*>([\s\S]*?)</head\s*>', source, re.I)
    if not head:
        raise ValueError('index.html に head 要素が見つかりません。')
    content = re.sub(r'<' + tag + r'\b[^>]*>', update, head.group(1), flags=re.I)
    if not used:
        content += '\n' + replacement + '\n'
    return source[:head.start(1)] + content + source[head.end(1):]


def set_schema_url(source, public_url):
    updated = False

    def update(match):
        nonlocal updated
        attrs = TagAttrs(match.group(1)).attrs
        if attrs.get('type', '').lower() != 'application/ld+json':
            return match.group(0)
        data = json.loads(match.group(2))

        def visit(item):
            nonlocal updated
            if isinstance(item, list):
                for entry in item:
                    visit(entry)
            elif isinstance(item, dict):
                types = item.get('@type', [])
                if isinstance(types, str):
                    types = [types]
                if 'WebApplication' in types or 'SoftwareApplication' in types:
                    item['url'] = public_url
                    updated = True
                if '@graph' in item:
                    visit(item['@graph'])

        visit(data)
        encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        encoded = encoded.replace('<', '\\u003c')
        return match.group(1) + encoded + match.group(3)

    source = re.sub(r'(<script\b[^>]*>)([\s\S]*?)(</script\s*>)', update, source, flags=re.I)
    if not updated:
        raise ValueError('index.html に WebApplication の構造化データが見つかりません。')
    return source


def atomic_write(path, content):
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n',
                                     dir=path.parent, delete=False) as output:
        temp = Path(output.name)
        output.write(content)
    try:
        temp.replace(path)
    finally:
        if temp.exists():
            temp.unlink()


def configure(folder, public_url):
    index = folder / 'index.html'
    source = index.read_text(encoding='utf-8')
    escaped = html.escape(public_url, quote=True)
    image_url = html.escape(public_url + 'assets/ogp.jpg', quote=True)
    source = set_head_tag(source, 'link', 'rel', 'canonical',
                          '<link rel="canonical" href="' + escaped + '">')
    source = set_head_tag(source, 'meta', 'property', 'og:url',
                          '<meta property="og:url" content="' + escaped + '">')
    source = set_head_tag(source, 'meta', 'property', 'og:image',
                          '<meta property="og:image" content="' + image_url + '">')
    source = set_head_tag(source, 'meta', 'name', 'twitter:image',
                          '<meta name="twitter:image" content="' + image_url + '">')
    source = set_schema_url(source, public_url)
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               '  <url><loc>' + xml_escape(public_url) + '</loc></url>\n'
               '</urlset>\n')
    robots = ('User-agent: *\nAllow: /\n\n'
              'Sitemap: ' + public_url + 'sitemap.xml\n')
    atomic_write(index, source)
    atomic_write(folder / 'sitemap.xml', sitemap)
    atomic_write(folder / 'robots.txt', robots)


def main():
    parser = argparse.ArgumentParser(description='連珠名人の公開URL・OGP・サイトマップを設定します。')
    parser.add_argument('url', type=base_url, help='HTTPSのサイトURL（リポジトリのパスまで含める）')
    args = parser.parse_args()
    try:
        configure(Path(__file__).resolve().parent, args.url)
    except (OSError, ValueError) as error:
        parser.exit(1, '設定できませんでした: ' + str(error) + '\n')
    print('公開URLを設定しました: ' + args.url)
    print('index.html / sitemap.xml / robots.txt をGitHubへ上書きしてください。')


if __name__ == '__main__':
    main()
