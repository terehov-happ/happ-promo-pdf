/* ───────────────────────────────────────────────────────────────────────────
 * Отчёт — тонкий слой поведения. Ничего не рендерит: вся разметка и все числа
 * лежат в index.html, поэтому страница читается и печатается со выключенным JS.
 * Здесь только три вещи: вскрытие шкал при попадании в кадр, подсветка текущего
 * раздела в топбаре и печать.
 * ─────────────────────────────────────────────────────────────────────────── */

(function () {
	'use strict';

	var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* ── Вскрытие шкал ──────────────────────────────────────────────────────
	 * Столбцы и прогресс-бары начинают сложенными и разворачиваются, когда блок
	 * входит в кадр. Один наблюдатель на все цели, и каждая снимается сразу
	 * после вскрытия: анимация одноразовая, держать её под наблюдением незачем.
	 */
	var reveals = document.querySelectorAll('[data-reveal]');

	/* Строки вскрываются не разом, а лесенкой: порядок в списке — это рейтинг, и
	 * последовательность его проговаривает. Шаг общий на блок (300ms на всё), а
	 * не фиксированный: у двенадцати тем 100ms на строку дали бы полторы секунды
	 * ожидания, а у двадцати четырёх столбцов — почти две с половиной. */
	function stagger(el) {
		var items = el.querySelectorAll('.criterion__fill, .bars__bar');
		if (!items.length) return;

		var step = Math.min(60, 300 / items.length);
		items.forEach(function (item, i) {
			item.style.transitionDelay = Math.round(i * step) + 'ms';
		});
	}

	function reveal(el) {
		if (!reduced) stagger(el);
		el.classList.add('is-revealed');

		/* Кольцо оценки анимируется через stroke-dashoffset, а не класс: конечное
		 * значение стоит в разметке (иначе без JS кольцо было бы пустым), поэтому
		 * здесь оно сбрасывается в полный обвод и возвращается на следующем кадре. */
		var ring = el.querySelector('[data-ring]');
		if (ring && !reduced) {
			var target = ring.getAttribute('stroke-dashoffset');
			var full = ring.getAttribute('stroke-dasharray');
			ring.setAttribute('stroke-dashoffset', full);
			requestAnimationFrame(function () {
				requestAnimationFrame(function () {
					ring.setAttribute('stroke-dashoffset', target);
				});
			});
		}
	}

	if (!('IntersectionObserver' in window) || reduced) {
		reveals.forEach(reveal);
	} else {
		var revealObserver = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					if (!entry.isIntersecting) return;
					reveal(entry.target);
					revealObserver.unobserve(entry.target);
				});
			},
			/* 12% — чтобы блок начинал разворачиваться уже видимым, а не за краем
			   экрана, и пользователь застал само движение. */
			{ threshold: 0.12 }
		);

		reveals.forEach(function (el) {
			revealObserver.observe(el);
		});
	}

	/* ── Подсветка раздела в топбаре ───────────────────────────────────────
	 * rootMargin поднимает «линию чтения» под топбар и на треть экрана вниз:
	 * активным считается раздел, который занял верхнюю часть окна, а не тот, чей
	 * край случайно выглянул снизу.
	 */
	var links = Array.prototype.slice.call(document.querySelectorAll('.topbar__nav a'));
	var sections = links
		.map(function (a) {
			return document.querySelector(a.getAttribute('href'));
		})
		.filter(Boolean);

	if (sections.length && 'IntersectionObserver' in window) {
		var visible = new Set();

		var setCurrent = function () {
			var current = null;
			for (var i = 0; i < sections.length; i++) {
				if (visible.has(sections[i])) {
					current = sections[i];
					break;
				}
			}
			links.forEach(function (a) {
				var on = current && a.getAttribute('href') === '#' + current.id;
				if (on) a.setAttribute('aria-current', 'true');
				else a.removeAttribute('aria-current');
			});
		};

		var navObserver = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) visible.add(entry.target);
					else visible.delete(entry.target);
				});
				setCurrent();
			},
			{ rootMargin: '-72px 0px -66% 0px', threshold: 0 }
		);

		sections.forEach(function (s) {
			navObserver.observe(s);
		});
	}

	/* ── Плавающий лаунчер ─────────────────────────────────────────────────
	 * Прячется, пока обложка в кадре: у героя своя кнопка «Завантажити PDF», и
	 * две одинаковые рядом читаются как сбой, а не как удобство. Разметка лежит
	 * с `hidden`, чтобы без скрипта лаунчер не мелькал поверх обложки; здесь он
	 * раскрывается и дальше живёт на атрибуте `data-hidden`.
	 */
	var launcher = document.querySelector('[data-launcher]');
	var cover = document.getElementById('cover');

	if (launcher) {
		launcher.hidden = false;

		if (cover && 'IntersectionObserver' in window) {
			launcher.setAttribute('data-hidden', '');

			new IntersectionObserver(
				function (entries) {
					entries.forEach(function (entry) {
						if (entry.isIntersecting) launcher.setAttribute('data-hidden', '');
						else launcher.removeAttribute('data-hidden');
					});
				},
				/* Обложка считается ушедшей, когда её нижние 15% вышли за кадр: по
				   нулевому порогу лаунчер моргал на каждом микродвижении у границы. */
				{ threshold: 0.15 }
			).observe(cover);
		}
	}

	/* ── Печать / сохранение в PDF ─────────────────────────────────────────
	 * Диалог печати браузера — единственный способ отдать PDF из статики без
	 * бэкенда, и он же даёт постраничную вёрстку из @media print. Шкалы перед
	 * печатью вскрываются принудительно: те, что не попали в кадр, остались бы
	 * свёрнутыми, и на бумаге вышли бы нулевые оценки вместо настоящих.
	 */
	function expandForPrint() {
		document.querySelectorAll('[data-reveal]').forEach(function (el) {
			el.classList.add('is-revealed');
		});
		document.querySelectorAll('.criterion__fill, .bars__bar').forEach(function (item) {
			item.style.transitionDelay = '';
		});
	}

	/* beforeprint покрывает и Ctrl/Cmd+P, и печать из меню браузера. */
	window.addEventListener('beforeprint', expandForPrint);

	document.querySelectorAll('[data-print]').forEach(function (btn) {
		btn.addEventListener('click', function () {
			/* Вызывать вскрытие ещё и здесь дешевле, чем полагаться на порядок
			 * событий в Safari, где beforeprint исторически приходил уже после
			 * снятия layout. */
			expandForPrint();
			window.print();
		});
	});
})();
