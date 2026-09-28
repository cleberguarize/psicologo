/* Paginas internas (servico, legal, 404).
   Nao ha empilhamento de dobras nem baralho de cards aqui, entao nada
   disto precisa do script da home. Este arquivo faz so o essencial:
   revelar o conteudo ao entrar na tela, marcar o cabecalho e trocar o botao
   fixo da hero pelo flutuante. */
(function () {
  "use strict";

  var targets = document.querySelectorAll(".reveal, .split, .stagger");

  function show(el) {
    el.classList.add("is-visible");
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        show(entries[i].target);
        io.unobserve(entries[i].target);
      }
    }, { threshold: 0, rootMargin: "0px 0px 6% 0px" });
    for (var t = 0; t < targets.length; t++) io.observe(targets[t]);
  } else {
    for (var j = 0; j < targets.length; j++) show(targets[j]);
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
