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
     - will-change virou .is-folding, ligado so enquanto ha dobra animando.
     ====================================================================== */

  /* ——— Reveal / fade de entrada ——— */

  var revealTargets = Array.prototype.slice.call(
    document.querySelectorAll(".reveal, .split, .stagger")
  );

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

  function checkReveals() {
    if (!pendingReveals.length) return;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var docH = document.documentElement.scrollHeight;
    var triggerY = vh * 1.04;
    var toReveal = [];
    for (var i = 0; i < pendingReveals.length; i++) {
      var rect = pendingReveals[i].getBoundingClientRect();
      if (rect.top < triggerY || rect.bottom < 0) toReveal.push(pendingReveals[i]);
    }
    for (var j = 0; j < toReveal.length; j++) reveal(toReveal[j]);
    if (scrollY + vh >= docH - 2) revealAll();
  }

  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) reveal(entries[i].target);
        }
      },
      { threshold: 0, rootMargin: "0px 0px 4% 0px" }
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

  /* ——— Temas: baralho de cards ———

     A pilha e uma solucao de LAYOUT, nao so decorativa. O grid natural de
     6 cards tem 1309px numa tela de 844px (celular) e, como o painel e
     sticky com 100vh, o excesso e cortado. Entao:

       1. measurePile() parte sempre do layout natural e mede se cabe;
       2. se cabe -> grid normal, com o card-in escalonado ja existente;
       3. se nao cabe -> baralho: cards absolutos empilhados, e o titulo
          continua visivel, so com a margem de baixo reduzida;
       4. o passo entre cards e calculado, nao fixo: o que sobra na dobra e
          distribuido entre eles, ate o limite de PILE_STEP_MAX. So quando
          nem com passo zero sobra espaco e que resta o grid natural.

     A entrada no baralho e DIRIGIDA PELA ROLAGEM, nao por tempo. O painel e
     sticky e fica grudado no topo durante toda a espera; o que da o relogio
     e o bloco de espera (a "hold"), que fica DEPOIS do painel. Cada card tem
     sua fatia do p, entao:

       - o primeiro aparece com fade e sobe ate o lugar dele;
       - o segundo aparece mais abaixo e sobe, ficando por cima do primeiro;
       - e assim por diante, ate o baralho completo;
       - so depois disso a dobra seguinte toma a tela.

     Rolar para cima desfaz a sequencia — e reversivel por construcao. */

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var themesPanel  = document.querySelector(".section--themes");
  var themesInner  = themesPanel ? themesPanel.querySelector(".stack-inner") : null;
  var themesHead   = themesPanel ? themesPanel.querySelector(".section__head") : null;
  var themeCards   = themesGrid
    ? Array.prototype.slice.call(themesGrid.querySelectorAll(".theme-card"))
    : [];

  var PILE_STEP_MAX = 28;  // px de deslocamento maximo entre cards
  var PILE_HEAD_GAP = 20;  // margem do titulo quando a pilha assume
  var PILE_PAD_BOT  = 20;  // folga no fim do baralho

  /* A espera e um bloco vazio entre Temas e a dobra seguinte, e NAO altura
     extra dentro do painel. A diferenca e toda a referencia:

       - com a espera dentro do painel (min-height), a posicao do painel no
         documento e dada por offsetTop — e offsetTop de um elemento sticky
         no Chrome ja vem deslocado: enquanto o painel esta grudado vale
         scrollY, nao o topo do fluxo. Ai o p dava 0 o tempo inteiro e a
         sequencia dos cards nunca rodava;
       - com a espera fora do painel, o painel continua com 100vh (o sticky
         gruda de verdade durante a espera) e a posicao da espera e a de um
         bloco comum, o mesmo para todo navegador.

     E o pedido do "empilhamento" sai de graca: como a espera esta entre as
     duas dobras, a seguinte nao tem como comecar a subir antes de a espera
     acabar. */
  var PILE_HOLD_PER_CARD = 0.32; // fracao de dobra de rolagem por card
  var PILE_HOLD_MIN = 0.8;       // piso da espera, em dobras
  var PILE_HOLD_MAX = 2.4;       // teto da espera, em dobras

  var pileActive  = false;
  var pileDwellPx = 0;
  var pileHold    = null;

  function ensurePileHold() {
    if (!themesPanel) return null;
    if (pileHold && pileHold.parentNode) return pileHold;
    pileHold = document.createElement("div");
    pileHold.className = "stack-hold";
    pileHold.setAttribute("aria-hidden", "true");
    themesPanel.insertAdjacentElement("afterend", pileHold);
    return pileHold;
  }

  function setPileDwell(px) {
    pileDwellPx = px > 0 ? px : 0;
    if (!pileDwellPx) {
      if (pileHold) pileHold.style.height = "";
      return;
    }
    var hold = ensurePileHold();
    if (hold) hold.style.height = pileDwellPx + "px";
  }

  function clearPile() {
    pileActive = false;
    pileP      = -1;
    setPileDwell(0);
    if (!themesGrid) return;
    themesGrid.classList.remove("themes--pile");
    themesGrid.style.height    = "";
    themesGrid.style.minHeight = "";
    for (var i = 0; i < themeCards.length; i++) {
      themeCards[i].style.removeProperty("--pile-y");
      themeCards[i].style.removeProperty("--pile-o");
      themeCards[i].style.removeProperty("--pile-m");
      themeCards[i].style.zIndex = "";
    }
    if (themesHead) themesHead.style.marginBottom = "";
  }

  /* Mede o espaco disponivel e decide entre grid natural e baralho.
     A entrada no baralho e rolagem pura, entao nada aqui anima: esta funcao
     so decide a geometria. */
  function measurePile() {
    clearPile();

    if (!themesGrid || !themeCards.length) return;

    // 1. Quanto espaco o painel oferece ao conteudo
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var avail = vh;
    if (themesInner) {
      var innerCS = getComputedStyle(themesInner);
      avail = vh - (parseFloat(innerCS.paddingTop) || 0) - (parseFloat(innerCS.paddingBottom) || 0);
    }
    if (!(avail > 0)) avail = vh;

    var n       = themeCards.length;
    var headH   = themesHead ? themesHead.offsetHeight : 0;
    var headGap = themesHead ? (parseFloat(getComputedStyle(themesHead).marginBottom) || 0) : 0;
    var gridH   = themesGrid.offsetHeight;

    // 2. Cabe no grid natural? Se cabe, e isso.
    if (headH + headGap + gridH <= avail) return;

    // 3. Nao cabe -> virar baralho e medir o card ja no layout do baralho
    themesGrid.classList.add("themes--pile");
    themesGrid.style.minHeight = "0";
    themesGrid.style.height    = "";

    var maxH = 0;
    for (var m = 0; m < n; m++) {
      var ch = themeCards[m].offsetHeight;
      if (ch > maxH) maxH = ch;
    }
    if (!maxH) { clearPile(); return; }

    // 4. Distribuir a sobra da dobra entre os cards
    var pileGap = PILE_HEAD_GAP;
    var padBot  = PILE_PAD_BOT;
    function stepFor(gap, pad) {
      var budget = avail - headH - gap - maxH - pad;
      return n > 1 ? Math.floor(budget / (n - 1)) : 0;
    }
    var step = stepFor(pileGap, padBot);
    if (step < 0) {
      pileGap = 0;
      padBot  = 0;
      step = stepFor(pileGap, padBot);
    }
    if (step < 0) { clearPile(); return; }
    if (step > PILE_STEP_MAX) step = PILE_STEP_MAX;

    for (var j = 0; j < n; j++) {
      themeCards[j].style.setProperty("--pile-y", (j * step) + "px");
      themeCards[j].style.zIndex = String(j + 1);
    }
    if (themesHead) themesHead.style.marginBottom = pileGap + "px";
    themesGrid.style.height = (maxH + (n - 1) * step + padBot) + "px";

    // 5. A espera: quanto de rolagem cada card merece
    var dwell    = Math.round(vh * n * PILE_HOLD_PER_CARD);
    var dwellMin = Math.round(vh * PILE_HOLD_MIN);
    var dwellMax = Math.round(vh * PILE_HOLD_MAX);
    if (dwell < dwellMin) dwell = dwellMin;
    if (dwell > dwellMax) dwell = dwellMax;
    setPileDwell(dwell);

    pileActive = true;
  }

  /* Cada card ocupa uma fatia de PILE_SEQ_END da espera, com leve sobreposicao
     para nao ficar travado, e o ultimo assenta no fim. PILE_SEQ_END fica
     logo abaixo de 1 de proposito: e a fracao da espera em que o baralho
     fica pronto. */
  var PILE_SEQ_END   = 0.92;
  var PILE_SEQ_OVER  = 1.15;
  var PILE_FADE_HEAD = 0.42;

  var pileP = -1;

  function updatePileProgress(p) {
    if (!pileActive || !themeCards.length) return;
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    if (p === pileP) return;
    pileP = p;

    var n      = themeCards.length;
    var settle = reduceMotion.matches;
    var span   = PILE_SEQ_END / n;
    var travel = span * PILE_SEQ_OVER;

    for (var i = 0; i < n; i++) {
      var start = i * span;
      var end   = (i === n - 1) ? PILE_SEQ_END : Math.min(start + travel, PILE_SEQ_END);
      var raw   = end > start ? (p - start) / (end - start) : (p >= end ? 1 : 0);
      if (raw < 0) raw = 0; else if (raw > 1) raw = 1;

      // Duas fases: primeiro o card aparece com fade parado no lugar de
      // origem; so depois que ele some de vez ele comeca a subir.
      var fade = raw / PILE_FADE_HEAD;
      if (fade > 1) fade = 1;

      /* Com movimento reduzido some o DESLOCAMENTO, nao a sequencia: o card
         continua aparecendo um a um conforme a rolagem, mas ja no lugar, sem
         deslizar nem escalonar. Zerar tudo de uma vez deixava os seis cards
         empilhados e visiveis desde o comeco da dobra. */
      if (settle) {
        themeCards[i].style.setProperty("--pile-o", fade.toFixed(3));
        themeCards[i].style.setProperty("--pile-m", "1");
        continue;
      }

      var rise = (raw - PILE_FADE_HEAD) / (1 - PILE_FADE_HEAD);
      if (rise < 0) rise = 0; else if (rise > 1) rise = 1;
      // smoothstep: sai devagar, acelera no meio e desacelera ao assentar
      var move = rise * rise * (3 - 2 * rise);

      themeCards[i].style.setProperty("--pile-o", fade.toFixed(3));
      themeCards[i].style.setProperty("--pile-m", move.toFixed(3));
    }
  }

  /* Chegar em Temas por ancora tem de mostrar o baralho montado. O destino
     nativo do link e o topo do painel, que e o instante p = 0 da sequencia:
     a dobra apareceria so com o titulo e nenhum card, o que parece pagina
     quebrada. Aqui o destino e o fim da espera, que e onde o baralho esta
     pronto — e a posicao da espera, bloco comum, que da a referencia sem
     depender de offsetTop (que, no painel grudado, devolve scrollY). */
  document.addEventListener("click", function (e) {
    if (!pileActive || !pileHold || !pileDwellPx) return;
    var link = e.target && e.target.closest ? e.target.closest('a[href="#temas"]') : null;
    if (!link) return;
    var target = Math.round(
      pileHold.getBoundingClientRect().top + window.scrollY
      - themesPanel.offsetHeight + pileDwellPx
    );
    e.preventDefault();
    window.scrollTo({ top: target, behavior: reduceMotion.matches ? "auto" : "smooth" });
    try { history.replaceState(null, "", "#temas"); } catch (err) { /* file:// */ }
  });

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

  var panelInners = stackPanels.map(function (panel) {
    return panel.querySelector(".stack-inner, .hero__layout");
  });
  var panelFx = stackPanels.map(function () { return { t: "", o: "" }; });
  var nextTops = stackPanels.map(function () { return NaN; });

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

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

  function setStackZ() {
    stackPanels.forEach(function (panel, i) {
      panel.style.zIndex = String(i + 1);
      panel.style.setProperty("--stack-z", String(i + 1));
    });
  }

  setStackZ();

  var lastScrollY = -1;
  var lastPct = -1;
  var pastHero = null;
  var scrolled = null;
  var isFolding = null;

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

    /* O baralho de temas anda na ESPERA, nao com a subida da dobra seguinte.
       A espera e o bloco vazio que fica depois do painel, e e ela que da a
       rolagem reservada da sequencia.

       O p sai da posicao da espera, que e a de um bloco comum:

           p = (altura do painel − topo da espera) / altura da espera

       que vale 0 quando a espera encosta na borda de baixo da tela e 1
       quando ela some de vez. */
    if (pileActive && pileHold && pileDwellPx > 0) {
      updatePileProgress(clamp01(
        (themesPanel.offsetHeight - pileHold.getBoundingClientRect().top) / pileDwellPx
      ));
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

    /* Leitura de nextTop so na faixa da dobra. Longe dela o valor guardado
       produz covered 0 ou 1, que e o resultado correto — o cache nao altera
       a tela e evita 6 leituras de geometria por quadro. */
    var band = vh * 1.25;
    var folding = false;
    for (var n = 0; n < stackPanels.length; n++) {
      var panel = stackPanels[n];
      var next  = stackPanels[n + 1];
      var t = "", o = "";

      var cached = nextTops[n];
      if (next && !(cached >= -band && cached <= band)) {
        cached = next.getBoundingClientRect().top;
        nextTops[n] = cached;
      }

      /* O efeito de dobra so faz sentido enquanto o painel consegue grudar.
         Um elemento sticky mais alto que a viewport nunca fica preso: ele
         simplesmente rola, e mesmo assim receberia covered=1 ja no começo,
         ficando com opacidade 0.75 e escala 0.955 a secao inteira. Nesse
         caso deixamos neutro. */
      if (next && panel.offsetHeight <= vh * 1.15 && cached === cached) {
        var covered = clamp01((vh - cached) / vh);
        if (covered > 0.001 && covered < 0.999) {
          folding = true;
          var scale = 1 - covered * 0.045;
          var dy    = covered * -12;
          t = "translate3d(0," + dy.toFixed(1) + "px,0) scale(" + scale.toFixed(4) + ")";
          o = (1 - covered * 0.25).toFixed(3);
        }
      }

      var inner = panelInners[n];
      var fx    = panelFx[n];
      if (inner) {
        if (fx.t !== t) { inner.style.transform = t; fx.t = t; }
        if (fx.o !== o) { inner.style.opacity = o; fx.o = o; }
      }
    }

    if (folding !== isFolding) {
      isFolding = folding;
      document.body.classList.toggle("is-folding", folding);
    }
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
      // Geometria mudou de forma: o cache de nextTop vale nada.
      for (var i = 0; i < nextTops.length; i++) nextTops[i] = NaN;
      measurePile();
      updateScroll(true);
    }, 180);
  }
  window.addEventListener("resize",            scheduleRemeasure, { passive: true });
  window.addEventListener("orientationchange", scheduleRemeasure, { passive: true });

  function onMotionPreferenceChange() {
    measurePile();
    updateScroll(true);
  }
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", onMotionPreferenceChange);
  } else if (reduceMotion.addListener) {
    reduceMotion.addListener(onMotionPreferenceChange);
  }

  /* ——— Inicializacao ——— */

  measurePile();
  updateScroll(true);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      for (var i = 0; i < nextTops.length; i++) nextTops[i] = NaN;
      measurePile();
      updateScroll(true);
      checkReveals();
    });
  }

  window.addEventListener("load", checkReveals, { passive: true });
  window.addEventListener("pageshow", checkReveals, { passive: true });
})();
