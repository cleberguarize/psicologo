/* Paginas internas (servico, legal, 404).
   Nao ha empilhamento de dobras nem baralho de cards aqui, entao nada
   disto precisa do script da home. Este arquivo faz so o essencial:
   revelar o conteudo ao entrar na tela, marcar o cabecalho e trocar o botao
   fixo da hero pelo flutuante. */
(function () {
  "use strict";

  /* Mesma varredura da home (ver main.js): as classes .reveal/.split/
     .stagger/.hero-line marcadas a mao so cobrem parte do conteudo, e um
     bloco sem fade ao lado de outros animando faz a dobra parecer sem
     efeito. Aqui todo bloco de conteudo que sobrou sem marcacao ganha
     .reveal. */
  var SKIP_SEL = ".stagger, .hero-line, .theme-card, .nav, .mmenu, " +
                 ".footer__inner, .footer__base, .btn--sticky, " +
                 "svg, path, .progress, .cookie, .reveal, .split";

  /* Um seletor so com closest(), e nao el.matches() mais uma varredura de
     ancestrais na mao. matches() so olha o proprio elemento, e a lista de
     exclusao esta nos ancestrais (.nav, .footer__inner, .mmenu): nenhum
     filho dessas caixas casava com ela, entao o rodape e o menu movel
     recebiam .reveal e animavam — o oposto do que o comentario acima
     manda. Medido nas paginas internas: .footer__tagline, .footer__title e
     .footer__list entravam com fade e atraso, e apareciam aos trancos.

     .footer__base e .btn--sticky entram na lista porque tem entrada propria:
     a base do rodape fica na ultima faixa da tela, onde o rootMargin do
     observer cria zona morta, e o botao flutuante e controlado por
     body.is-past-hero / body.at-footer, com opacity e visibility proprias. */
  function skipReveal(el) {
    return el.closest(SKIP_SEL) !== null;
  }

  var autoBlocks = document.querySelectorAll(
    "h1, h2, h3, h4, p, img, blockquote, figure, details, ul, ol, .btn, .card"
  );
  for (var a = 0; a < autoBlocks.length; a++) {
    var el = autoBlocks[a];
    if (skipReveal(el)) continue;
    el.classList.add("reveal");
  }

  /* Entrada sequencial dentro de cada bloco pai, para os --rd nao se
     acumularem entre as secoes. O passo e 0.25 e o CSS multiplica o --rd por
     --in-delay-scale (0.4), entao o passo efetivo entre vizinhos e 0.1s. */
  var groups = document.querySelectorAll(".page-card, .prose, .section__head");
  for (var g = 0; g < groups.length; g++) {
    var kids = groups[g].querySelectorAll(":scope > .reveal");
    for (var k = 0; k < kids.length; k++) {
      if (!kids[k].style.getPropertyValue("--rd")) {
        kids[k].style.setProperty("--rd", (k * 0.25).toFixed(2) + "s");
      }
    }
  }

  var targets = Array.prototype.slice.call(
    document.querySelectorAll(".reveal, .split, .stagger")
  );

  function show(el) {
    el.classList.add("is-visible");
    var i = pending.indexOf(el);
    if (i > -1) pending.splice(i, 1);
  }

  var pending = targets.slice();

  function showAll() {
    while (pending.length) show(pending[0]);
    if (io) io.disconnect();
  }

  /* Rede de seguranca, e nao um segundo gatilho. A home ja tinha uma
     (ver checkReveals em main.js); aqui nao havia nada, e a ausencia era o
     defeito.

     O rootMargin de -10% encolhe a base da janela e cria uma faixa morta:
     um elemento parado nos 10% de baixo da tela nao cruza a raiz do
     observer, entao nunca dispara. No fim do documento essa faixa e
     exatamente onde o rodape fica, e a pagina nao rola mais para tirar o
     elemento dali — o que travava em opacity 0 para sempre. Medido com a
     rolagem toda no fim: .footer__copy e um h2 de conteudo sem
     is-visible, invisiveis.

     Aqui a condicao e deliberadamente mais larga que a linha de entrada:
     nao pergunta "chegou na linha de 90%", pergunta "esta na tela?". Se
     esta, precisa estar visivel. */
  function checkReveals() {
    if (!pending.length) return;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var docH = document.documentElement.scrollHeight;
    var toReveal = [];
    for (var i = 0; i < pending.length; i++) {
      var rect = pending[i].getBoundingClientRect();
      if ((rect.top < vh + 0.5 && rect.bottom > -0.5) || rect.bottom < 0) {
        toReveal.push(pending[i]);
      }
    }
    for (var j = 0; j < toReveal.length; j++) show(toReveal[j]);
    if (scrollY + vh >= docH - 2) showAll();
  }

  /* rootMargin de -10% = start "top 90%", o mesmo gatilho do efeito de
     referencia e o mesmo da home. Aqui eram 6% — que e margem positiva, ou
     seja, a raiz crescia 6% para baixo da tela e o elemento disparava antes
     de entrar — enquanto a home usava -15%. Duas metades do site com
     gatilhos opostos: o mesmo bloco de estilo produzia sensacoes de chegada
     diferentes conforme a pagina. */
  var io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        show(entries[i].target);
        io.unobserve(entries[i].target);
      }
    }, { threshold: 0, rootMargin: "0px 0px -10% 0px" });
    for (var t = 0; t < targets.length; t++) io.observe(targets[t]);
  } else {
    for (var j = 0; j < targets.length; j++) show(targets[j]);
  }

  checkReveals();

  var idleTimer = 0;
  function scheduleIdleCheck() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(checkReveals, 120);
  }
  window.addEventListener("scroll", scheduleIdleCheck, { passive: true });
  window.addEventListener("resize", checkReveals, { passive: true });
  window.addEventListener("load", checkReveals, { passive: true });
  window.addEventListener("pageshow", checkReveals, { passive: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(checkReveals);
  }

  /* Mesma regra da home: a hero tem o botao no fluxo, e o flutuante entra
     depois dela. Sem este bloco o .btn--sticky ficaria invisivel para sempre
     em 9 das 10 paginas, porque ele so aparece com is-past-hero.

     E so isso. O botao nao reage a direcao da rolagem nem a rolagem parar: ele
     e' fixo. Este handler so compara o valor atual com o anterior para nao
     escrever classe a cada quadro, e e' um cruzamento de limiar unico, nao um
     acompanhamento continuo. */
  var nav = document.querySelector(".nav");
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var lastScrolled = null;
  var lastPastHero = null;

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;

    var scrolledNow = y > 24;
    if (scrolledNow !== lastScrolled) {
      lastScrolled = scrolledNow;
      if (nav) nav.classList.toggle("is-scrolled", scrolledNow);
    }

    var pastHeroNow = y > vh * 0.6;
    if (pastHeroNow !== lastPastHero) {
      lastPastHero = pastHeroNow;
      document.body.classList.toggle("is-past-hero", pastHeroNow);
    }
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    vh = window.innerHeight || document.documentElement.clientHeight;
    onScroll();
  }, { passive: true });

  /* O flutuante nao aparece com o rodape na tela. IntersectionObserver em vez
     de conta de scroll: o rodape e' o elemento observado, entao o navegador
     avisa sozinho quando ele entra e sai, sem aritmetica de posicao que
     quebraria em resize, zoom ou fonte do sistema maior. */
  var footer = document.querySelector(".footer");
  if (footer && "IntersectionObserver" in window) {
    var fIo = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        document.body.classList.toggle("at-footer", entries[k].isIntersecting);
      }
    }, { threshold: 0 });
    fIo.observe(footer);
  }
})();
