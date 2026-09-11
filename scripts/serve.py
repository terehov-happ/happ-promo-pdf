# Локальный просмотр отчёта.
#
#   python ./scripts/serve.py            → http://127.0.0.1:8777
#   python ./scripts/serve.py 9000       → другой порт
#
# Обычно отчёт открывается прямо файлом: это статика, и `file://` ей хватает.
# Сервер нужен в двух случаях.
#
# 1. Замер высот разделов под печать (см. README): из `file://` браузер не
#    отдаёт `sheet.cssRules` — лист считается чужим origin, и переключить
#    `@media print` на `all` из консоли не выйдет.
#
# 2. Правка стилей. `python -m http.server` не шлёт Cache-Control вовсе, Chrome
#    применяет эвристическое кэширование и после правки CSS отдаёт старый файл —
#    правки видно только по Ctrl+Shift+R, и это успевает сбить с толку. Здесь
#    заголовок задан явно.

import functools
import http.server
import sys
from pathlib import Path

PORT = 8777
ROOT = Path(__file__).resolve().parent.parent / 'report'


class NoCache(http.server.SimpleHTTPRequestHandler):
	def end_headers(self):
		self.send_header('Cache-Control', 'no-store, must-revalidate')
		super().end_headers()

	def log_message(self, *args):
		pass


def main():
	port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT

	if not ROOT.is_dir():
		raise SystemExit(f'Не найден {ROOT}')

	handler = functools.partial(NoCache, directory=str(ROOT))
	server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)

	print(f'http://127.0.0.1:{port}/index.html  ({ROOT})')
	print('Ctrl+C — остановить')

	try:
		server.serve_forever()
	except KeyboardInterrupt:
		print()


if __name__ == '__main__':
	main()
