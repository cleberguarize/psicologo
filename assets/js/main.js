(function () {
  "use strict";

  /* ======================================================================
     Otimizacoes que mudaram o comportamento do laco de rolagem
     ----------------------------------------------------------------------
     - O varrimento de 200ms e o checkReveals() dentro de updateScroll()
       sumavam ~20 getBoundingClientRect por quadro, intercalados com
       escritas de estilo (leitura-escrita-leitura = layout forcado a cada
       frame). Agora o reveal e 100% IntersectionObserver, com uma checagem
       unica no boot e outra quando as fontes chegam.
     - O spy da nav lia 4 getBoundingClientRect por quadro. Virou um
       IntersectionObserver com a linha de leitura embutida no rootMargin.
      - O nextTop das dobras so e relido quando o valor cacheado esta perto
        da dobra. Longe dela o valor ja produz covered=0 ou covered=1, que e
        o resultado correto, entao o cache nao muda nada na tela.
      - border-radius era escrito a cada quadro num elemento de 100vh: um
        repaint de tela cheia por frame, para um efeito quase imperceptivel.
      - O baralho de cards de Temas foi desativado: os cards ficam no grid
        natural, entao nao ha medicao de pilha nem escrita de estilo a cada
        quadro. A rolagem nao escreve mais nada nos cards.
      - will-change virou .is-folding, ligado so enquanto ha dobra animando.
   ====================================================================== */

  /* ——— Reveal / fade de entrada ——— */

  var revealTargets = [];

  /* Varredura automatica: cobre o resto do conteudo.
     As classes acima sao marcadas a mao no HTML e sempre cobriram so parte
     dele. Medido nesta pagina, 36 blocos tinham marcacao e 67 nao — a imagem
     da hero, varios pares de h3/p, os itens do rodape. Esses apareciam de
     uma vez, sem fade, e como a entrada e uma transicao de opacidade, um
     unico bloco sem animacao ao lado de outros animando faz a dobra inteira
     parecer sem efeito. Da a sensacao de "nao tem fade nenhum" mesmo com a
     transicao longa.

     Aqui cada bloco de conteudo que ainda nao foi marcado recebe .reveal, e
     a ordem de entrada e definida por --rd. Marcar no JS e nao no HTML por
     dois motivos: cobre as 10 paginas de uma vez, e uma lista nova de
     conteudo ja entra animado sem ninguem lembrar de adicionar a classe.

     O que NAO e alvo, de proposito:
     - .stagger e seus filhos: ja entram escalonados, e o pai animando
       junto com os filhos dobraria o desfoque.
     - elementos dentro de .reveal/.split/.hero-line ja animation: animar o
       filho e o pai ao mesmo tempo faz o texto atravessar duas transicoes
       de uma vez. O .btn dentro de .hero__cta e de .page-hero__cta cai
       aqui: os dois wrappers entram com hero-line.
     - o h3, o p e o .theme-card__more dentro de .theme-card: o card ja
       entra pelo card-in, ligado no .is-visible do grid (ver CSS). Marcar
       o texto interno produziria o card subindo enquanto o proprio texto
       ainda esta com opacity 0.
     - nav, colunas do rodape e o menu movel: sao navegacao, e animar
       eles no carregamento briga com a nav fixa.
     - .footer__base e .btn--sticky: os dois tem entrada propria. A base do
       rodape fica na ultima faixa da tela, onde o rootMargin do observer
       cria zona morta, entao dependeria da rede de seguranca para aparecer
       (funciona, mas e um salto de opacidade sem fade, que e o oposto do
       efeito). E o botao flutuante e controlado por body.is-past-hero /
       body.at-footer, com opacity e visibility proprias: entra-lo na varredura
       misturaria duas maquinas de estado no mesmo elemento, e o is-visible
       passaria a disputar com o is-past-hero no mesmo seletor.
     - svg e elementos sem dimensao propria: nao ha o que fading. */
  var SKIP_SEL = ".stagger, .hero-line, .theme-card, .nav, .mmenu, " +
                 ".footer__inner, .footer__base, .btn--sticky, " +
                 "svg, path, .progress, .cookie, .reveal, .split";

  /* Um seletor so, resolvido com closest(), no lugar de el.matches() para o
     elemento mais uma varredura de ancestrais escrita a mao.

     A versao anterior testava a lista de exclusao com el.matches(), que so
     olha o proprio elemento — nenhum filho de .nav, .mmenu ou .footer__inner
     casa com a lista, porque a lista esta no pai. A checagem de ancestrais
     seguinte cobria .reveal/.split/.stagger/.hero-line/.theme-card e nao
     cobria .nav/.mmenu/.footer__inner. Medido nesta pagina: .footer__tagline,
     .footer__title e .footer__list recebiam .reveal, e os itens do menu
     movel tambem — exatamente o que o comentario acima manda nao fazer.
     Alem de animarem sem querer, esses blocos entram com atraso e a coluna
     do rodape aparece aos trancos.

     closest() sobe a arvore a partir do elemento, incluindo ele mesmo, que
     e a intencao original: pular o bloco se ele, ou qualquer ancestral,
     estiver na lista. */
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

  /* A entrada e sequencial dentro de cada bloco pai, nao global. Sem isto os
     --rd se acumulariam entre as dobras e o rodape comecaria a aparecer
     quase um segundo depois do titulo da secao que vem logo acima dele.

     0.25 e o valor bruto: o CSS multiplica o --rd por --in-delay-scale (0.4)
     antes de usar, entao o passo efetivo entre vizinhos e 0.1s. O numero
     escrito aqui e sempre subjectis a essa escala — subir para 0.5 aqui da
     um passo efetivo de 0.2s, nao 0.5s. */
  var groups = document.querySelectorAll(".section__head, .hero__copy, .closing__card, .about__grid, .how__grid, .faq");
  for (var g = 0; g < groups.length; g++) {
    var kids = groups[g].querySelectorAll(":scope > .reveal");
    for (var k = 0; k < kids.length; k++) {
      if (!kids[k].style.getPropertyValue("--rd")) {
        kids[k].style.setProperty("--rd", (k * 0.25).toFixed(2) + "s");
      }
    }
  }

  /* A lista de alvos e lida aqui, e nao no topo do arquivo, porque a varredura
     acima acabou de marcar dezenas de blocos com .reveal. Ler antes pegaria
     so o que ja estava escrito no HTML, e todo bloco acrescentado pela
     varredura ficaria com opacity: 0 para sempre: sem is-visible e sem
     observer, ou seja, conteudo que nunca aparece. */
  revealTargets = Array.prototype.slice.call(
    document.querySelectorAll(".reveal, .split, .stagger")
  );

  /* A varredura acima pode ter incluido o proprio grid de temas como
     .reveal. Se isso aconteceu, ele fica fora da lista de alvos: a entrada
     dos cards e feita pelas animacoes card-*, ligadas no CSS, e nao pela
     transicao de opacidade do grid. O filtro vem ANTES do push por causa
     disso: filtrando depois, ele removeria tambem o gancho recem-adicionado
     e o grid nunca receberia is-visible, ou seja, os seis cards entrariam
     de uma vez, sem o escalonamento. */
  revealTargets = revealTargets.filter(function (el) {
    return !el.classList.contains("themes__grid");
  });

  /* O grid de temas usa .is-visible so como gancho para disparar o card-in
     dos cards (ver CSS). Precisa entrar na lista para ser revelado na hora
     certa em vez de ficar com opacidade 0 para sempre. */
  var themesGrid = document.querySelector(".themes__grid");
  if (themesGrid) revealTargets.push(themesGrid);

  var pendingReveals = revealTargets.slice();
  var io = null;
  var idleTimer = 0;
  var scrollIdleTimer = 0;

  function reveal(el) {
    if (!el || el.classList.contains("is-visible")) return;
    el.classList.add("is-visible");
    var i = pendingReveals.indexOf(el);
    if (i > -1) pendingReveals.splice(i, 1);
  }

  function revealAll() {
    while (pendingReveals.length) reveal(pendingReveals[0]);
    if (io) io.disconnect();
  }

  /* A linha de entrada e o rootMargin do observer, mais abaixo: -10%
     da base da janela, ou seja, start "top 90%", o mesmo do efeito de
     referencia. Com a curva antiga a conta equivalente aqui usava 0.85,
     e a correcao compensava a lentidao da curva: o fade demorava 2.2s e
     comecava plano, entao quanto mais cedo melhor. Com power2.out o texto
     responde nos primeiros 100ms, e 90% deixa o fade terminar com o
     elemento ja bem visivel em vez de ainda entrando na tela.

     Rede de seguranca do gatilho, e nao um segundo gatilho.
     O rootMargin de -10% encolhe a base da janela, e isso cria uma faixa
     morta: um elemento parado nos 10% de baixo da tela nao cruza a raiz do
     observer, entao nunca dispara. No fim do documento essa faixa e
     justamente onde o rodape fica, e a pagina nao rola mais para tirar o
     elemento dali. Medido: com a rolagem toda no fim, .footer__copy ficava
     em opacity 0 sem is-visible, e um h2 de conteudo ficava igual.

     Por isso o observer sozinho nao basta. Esta funcao e a condicao de
     seguranca, e ela e deliberadamente mais larga que a linha de entrada:
     nao pergunta "o elemento chegou na linha de 90%", pergunta "o elemento
     esta na tela?". Se esta, ele precisa estar visivel — texto invisible
     na tela e bug, nao design. A linha de 90% continua mandando no caso
     normal, via observer; aqui so entra o que o observer deixaria para
     tras. */
  function checkReveals() {
    if (!pendingReveals.length) return;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var docH = document.documentElement.scrollHeight;
    var toReveal = [];
    for (var i = 0; i < pendingReveals.length; i++) {
      var rect = pendingReveals[i].getBoundingClientRect();
      /* Na tela (com uma folga de meio pixel para nao depender de
         arredondamento) ou ja inteiro acima dela. */
      if ((rect.top < vh + 0.5 && rect.bottom > -0.5) || rect.bottom < 0) {
        toReveal.push(pendingReveals[i]);
      }
    }
    for (var j = 0; j < toReveal.length; j++) reveal(toReveal[j]);
    /* Fim do documento: o que sobrou nao esta mais atras de nenhuma rolagem,
       entao aparece de uma vez. */
    if (scrollY + vh >= docH - 2) revealAll();
  }

  /* rootMargin de -10% = start "top 90%", a linha de entrada do efeito de
     referencia. O elemento entra quando o topo dele passa a linha que fica
     10% acima da base da tela — antes de ele aparecer, e com tempo de sobra
     para o fade rodar inteiro na frente do olho. */
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) reveal(entries[i].target);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -10% 0px" }
    );
    for (var t = 0; t < revealTargets.length; t++) io.observe(revealTargets[t]);
  }

  checkReveals();

  function scheduleIdleCheck() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(checkReveals, 120);
  }

  function markScrolling() {
    document.body.classList.add("is-scrolling");
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(function () {
      document.body.classList.remove("is-scrolling");
    }, 140);
    scheduleIdleCheck();
  }

  /* Brilho que segue o cursor. O retangulo e medido uma vez, na entrada do
     ponteiro: antes, cada pointermove forcava um layout por causa do
     getBoundingClientRect. */
  if (window.matchMedia("(hover: hover)").matches) {
    Array.prototype.forEach.call(document.querySelectorAll(".btn"), function (btn) {
      var rect = null;
      btn.addEventListener("pointerenter", function () {
        rect = btn.getBoundingClientRect();
      });
      btn.addEventListener("pointermove", function (e) {
        if (!rect) return;
        btn.style.setProperty("--mx", e.clientX - rect.left + "px");
        btn.style.setProperty("--my", e.clientY - rect.top + "px");
      });
      btn.addEventListener("pointerleave", function () {
        rect = null;
      });
    });
  }

  /* ——— Temas: cards no grid natural ———

     Os seis cards ficam no grid responsivo de 1/2/3 colunas (ver CSS) e
     entram pelo card-in escalonado, disparado por .is-visible no grid. Nao ha
     mais baralho: nada de medicao, nada de posicao absoluta e nada escrito a
     cada quadro de rolagem. Se a secao passar da altura da janela, ela rola
     junto com o resto da pagina. */

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ——— Stack de secoes + nav + progresso ——— */

  var stackPanels = Array.prototype.slice.call(document.querySelectorAll("[data-stack]"));
  var progressBar = document.getElementById("progressBar");
  var ticking     = false;

  var nav = document.getElementById("nav");
  var spyItems = Array.prototype.slice
    .call(document.querySelectorAll(".nav__link"))
    .map(function (link) {
      var id = (link.getAttribute("href") || "").replace("#", "");
      return { link: link, section: document.getElementById(id) };
    })
    .filter(function (item) { return item.section; });

  /* Spy por IntersectionObserver: a faixa [-35%, -45%] da janela e a linha
     de leitura. As dobras tem 100vh e sao contiguas, entao no maximo uma delas
     cobre a faixa — quem entra nela e o que esta sendo lido. Se a faixa fica
     vazia (no rodape, por exemplo), o destaque anterior e mantido. */
  if ("IntersectionObserver" in window && spyItems.length) {
    function setSpy(k) {
      for (var j = 0; j < spyItems.length; j++) {
        spyItems[j].link.classList.toggle("is-active", j === k);
      }
    }
    var spyIO = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        for (var k = 0; k < spyItems.length; k++) {
          if (spyItems[k].section !== entries[i].target) continue;
          setSpy(k);
          break;
        }
      }
    }, { rootMargin: "-35% 0px -55% 0px", threshold: 0 });
    for (var s = 0; s < spyItems.length; s++) spyIO.observe(spyItems[s].section);
    setSpy(0);
  }

  /* Empilhamento entre dobras desativado: as secoes rolam em fluxo normal,
     com todo o conteudo exposto. As classes de mecanismo abaixo ficaram sem
     uso (is-tall, is-reveal, holds) e os corpos das funcoes foram esvaziados. */

  function setStackZ() {
    stackPanels.forEach(function (panel, i) {
      panel.style.zIndex = String(i + 1);
      panel.style.setProperty("--stack-z", String(i + 1));
    });
  }

  function updateStackFlags() {}

  setStackZ();

  var themesSectionEl = document.getElementById("temas");
  var revealStates = stackPanels.map(function (panel) {
    return {
      panel: panel,
      inner: panel.querySelector(".stack-inner, .hero__layout"),
      hold: null,
      overflow: 0,
      active: false,
      y: 0
    };
  });

  function clearReveal(st) {
    st.active = false;
    st.overflow = 0;
    st.y = 0;
    if (st.panel) st.panel.classList.remove("is-reveal");
    if (st.hold && st.hold.parentNode) st.hold.parentNode.removeChild(st.hold);
    st.hold = null;
  }

  function ensureRevealHold(st) {
    if (!st.panel || (st.hold && st.hold.parentNode)) return st.hold;
    st.hold = document.createElement("div");
    st.hold.className = "stack-hold";
    st.hold.setAttribute("aria-hidden", "true");
    st.panel.insertAdjacentElement("afterend", st.hold);
    return st.hold;
  }

  function measureReveals() {
    for (var i = 0; i < revealStates.length; i++) clearReveal(revealStates[i]);
  }

  var lastScrollY = -1;
  var lastPct = -1;
  var pastHero = null;
  var scrolled = null;

  function updateScroll(force) {
    var scrollY = window.scrollY || window.pageYOffset;
    var vh      = window.innerHeight;
    var docH    = document.documentElement.scrollHeight - vh;

    // Quadro sem rolagem: nao ha nada a recalcular nem a escrever.
    if (!force && scrollY === lastScrollY) return;
    lastScrollY = scrollY;

    var navScrolledNow = scrollY > 24;
    /* 0.6 da altura da tela = ja passou da hero. E o unico gatilho do botao
       flutuante, e e um cruzamento de limiar unico: depois de ligado, o
       botao fica fixo e nao reage mais a rolagem, em nenhuma direcao. */
    var pastHeroNow    = scrollY > vh * 0.6;
    if (navScrolledNow !== scrolled) {
      scrolled = navScrolledNow;
      if (nav) nav.classList.toggle("is-scrolled", navScrolledNow);
    }
    if (pastHeroNow !== pastHero) {
      pastHero = pastHeroNow;
      document.body.classList.toggle("is-past-hero", pastHeroNow);
    }

    if (progressBar) {
      var pct = docH > 0 ? (scrollY / docH) * 100 : 0;
      if (pct < 0) pct = 0; else if (pct > 100) pct = 100;
      if (Math.abs(pct - lastPct) > 0.15) {
        lastPct = pct;
        progressBar.style.width = pct.toFixed(2) + "%";
      }
    }

    if (!stackPanels.length) return;

    /* O efeito de dobra/fold foi desativado: as secoes rolam em fluxo normal
       e nada de transform/opacity e escrito no .stack-inner. */
  }

  function onScroll() {
    markScrolling();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      try { updateScroll(false); } finally { ticking = false; }
    });
  }

  window.addEventListener("scroll",            onScroll,     { passive: true });
  window.addEventListener("orientationchange", onScroll,     { passive: true });
  window.addEventListener("hashchange",        onScroll,     { passive: true });

  /* O flutuante nao aparece com o rodape na tela. IntersectionObserver em vez
     de conta de scroll: o rodape e' o elemento observado, entao o navegador
     avisa sozinho quando ele entra e sai, sem aritmetica de posicao que
     quebraria em resize, zoom ou fonte do sistema maior. */
  var footerEl = document.querySelector(".footer");
  if (footerEl && "IntersectionObserver" in window) {
    var footerIo = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        document.body.classList.toggle("at-footer", entries[k].isIntersecting);
      }
    }, { threshold: 0 });
    footerIo.observe(footerEl);
  }

  var remeasureTimer = 0;
  function scheduleRemeasure() {
    clearTimeout(remeasureTimer);
    remeasureTimer = setTimeout(function () {
      measureReveals();
      updateStackFlags();
      updateScroll(true);
    }, 180);
  }
  window.addEventListener("resize",            scheduleRemeasure, { passive: true });
  window.addEventListener("orientationchange", scheduleRemeasure, { passive: true });

  function onMotionPreferenceChange() {
    measureReveals();
    updateStackFlags();
    updateScroll(true);
  }
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", onMotionPreferenceChange);
  } else if (reduceMotion.addListener) {
    reduceMotion.addListener(onMotionPreferenceChange);
  }

  /* ——— Inicializacao ——— */

  measureReveals();
  updateStackFlags();
  updateScroll(true);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      measureReveals();
      updateStackFlags();
      updateScroll(true);
      checkReveals();
    });
  }

  window.addEventListener("load", checkReveals, { passive: true });
  window.addEventListener("pageshow", checkReveals, { passive: true });
})();
