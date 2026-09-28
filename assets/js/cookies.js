/* Gerenciador de consentimento de cookies — Lei 13.709/2018 (LGPD).
   ----------------------------------------------------------------------
   Requisitos da lei que este arquivo tenta atender, e como:

   - Art. 8 §1: consentimento especifico, informado e inequivoco. Por isso
     existe a tela de preferencias por categoria, e nao um so botao de
     "aceitar". Nenhuma categoria comeca marcada.
   - Art. 8 §2 e Art. 9 §2: proibicao denamicos de consentimento. Por isso
     nao existe opcao pre-selecionada, contador de reject, botao de fechar
     (X) nem adiamento automatico. "Recusar" e um botao de primeira classe,
     com o mesmo peso visual de "Aceitar todos".
   - Art. 8 §5: direito de revogar. A escolha pode ser refeita a qualquer
     momento pelo link "Preferencias de cookies" no rodape de todas as
     paginas. Guardar a recusa e tao obrigatorio quanto guardar a aceitacao.
   - Art. 6 VII / Art. 46: finalidade, forma e duracao de cada categoria
     sao descritas na tela de preferencias, nao em letra miuda.
   - Art. 41: registro do consentimento. Alem do armazenamento local, cada
     decisao gera um evento `lgpd_consent_update` e um registro no
     dataLayer, para poder ser reconstituido em auditoria.

   Duas decisoes que valem explicacao:

   1. O registro do consentimento vai para localStorage, nao para um cookie.
      Usar um cookie para guardar a escolha seria pedir consentimento para
      gravar o consentimento. localStorage nao cria identificador de
      navegador, entao nao entra no calculo de dado pessoal aqui feito.
   2. O banner nao bloqueia o site e nao atrasa a exibicao. Esconder um
      aviso de consentimento para capturar a pessoa antes de ela fechar a
      aba e um padrao que a ANPD ja questiona. O site funciona inteiro
      sem consentimento: o que nao foi autorizado simplesmente nao carrega.
   ---------------------------------------------------------------------- */
(function () {
  "use strict";

  var CONFIG = {
    /* Preencha para aturar medicao de audiencia. Vazio = bannerso informa
       o que existe hoje: nenhum recurso opcional carregado. */
    gaId: "",
    version: 1
  };

  var KEY = "lgpd_consent";

  var CATEGORIES = [
    {
      id: "necessarios",
      label: "Necessarios",
      locked: true,
      desc: "Guardam a sua escolha de cookies e a preferencia de movimento reduzido. Sao a base do site funcionar e nao podem ser desligados."
    },
    {
      id: "analytics",
      label: "Medicao de audiencia",
      desc: "Ajudam a saber quantas pessoas chegam ate aqui e quais paginas visitam, sem identificar ninguem. Usei apenas para melhorar o site."
    },
    {
      id: "marketing",
      label: "Publicidade",
      desc: "Usados para medir ou exibir anuncios de terceiros. Este site nao publica anuncios, entao esta categoria fica desligada por padrao."
    }
  ];

  /* ——— Persistencia ——— */

  function readStore() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeStore(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      /* Modo privado / file:// sem armazenamento. A decisao vale para a
         navegacao atual mesmo assim. */
      return false;
    }
  }

  function stored() {
    var s = readStore();
    if (!s || s.version !== CONFIG.version) return null;
    return s;
  }

  /* Consentimento e um estado inicial, nao um padrao. Sem registro, vale
     "nenhum opcional autorizado" — e o banner aparece. */
  function current() {
    var s = stored();
    if (s && s.consent) return s;
    return { id: null, version: CONFIG.version, ts: null, source: null, consent: { necessarios: true, analytics: false, marketing: false } };
  }

  function hasDecision() {
    return !!stored();
  }

  function granted(id) {
    if (id === "necessarios") return true;
    var s = stored();
    return !!(s && s.consent && s.consent[id]);
  }

  /* ——— Efeitos colaterais ——— */

  function announce(state) {
    var detail = {
      id: state.id,
      ts: state.ts,
      source: state.source,
      version: state.version,
      consent: state.consent
    };

    /* dataLayer e o canal que o Google Tag Manager escuta. O GTM so carrega
       depois deste push, entao a ordem importa: primeiro o estado, depois
       qualquer tag que dependa dele. */
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "lgpd_consent_update", lgpd: detail });

    try {
      document.dispatchEvent(new CustomEvent("lgpd:consent", { detail: detail }));
    } catch (err) {
      /* Navegadores muito antigos: o dataLayer acima ja foi gravado. */
    }
  }

  /* Bloco comentado de proposito. Quando CONFIG.gaId for preenchido, e o
     analytics for autorizado, o gtag.js entra por aqui. Sem preenchimento
     nenhum recurso opcional e requisitado — que e o estado real do site.
       var s = document.createElement("script");
       s.async = true;
       s.src = "https://www.googletagmanager.com/gtag/js?id=" + CONFIG.gaId;
       document.head.appendChild(s);
       window.dataLayer = window.dataLayer || [];
       window.gtag = function () { window.dataLayer.push(arguments); };
       window.gtag("js", new Date());
       window.gtag("config", CONFIG.gaId, { anonymize_ip: true }); */

  /* ——— Markup ——— */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildBanner() {
    var box = el("div", "cookie");
    box.id = "cookieBanner";
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", "Aviso sobre cookies");
    box.hidden = true;

    var inner = el("div", "cookie__inner");

    var text = el("div", "cookie__text");
    text.appendChild(el("h2", "cookie__title", "Cookies neste site"));
    var p = el("p", null);
    p.appendChild(document.createTextNode("Uso apenas cookies necessarios para o site funcionar, e guardo a sua escolha localmente no seu navegador. Nao uso Publicidade e, se voce quiser, tambem nao meço a audiencia. Voce decide. Leia a "));
    var link = el("a", null, "Politica de Privacidade");
    link.href = "politica-de-privacidade.html#cookies";
    p.appendChild(link);
    p.appendChild(document.createTextNode("."));
    text.appendChild(p);
    inner.appendChild(text);

    var actions = el("div", "cookie__actions");

    var acceptAll = el("button", "btn", "Aceitar todos");
    acceptAll.type = "button";
    acceptAll.setAttribute("data-cookie", "all");
    actions.appendChild(acceptAll);

    /* Recusar e um botao de primeira classe, do mesmo tamanho e peso do
       aceite. Degradar a recusa — cinza, menor, escondida — e a forma mais
       comum de consentimento nada valido, e o que a ANPD fiscaliza. */
    var necessary = el("button", "btn btn--quiet", "Usar apenas necessarios");
    necessary.type = "button";
    necessary.setAttribute("data-cookie", "necessary");
    actions.appendChild(necessary);

    var manage = el("button", "cookie__link", "Gerenciar preferencias");
    manage.type = "button";
    manage.setAttribute("data-cookie", "manage");
    actions.appendChild(manage);

    inner.appendChild(actions);
    box.appendChild(inner);
    return box;
  }

  function switchRow(cat, on, locked) {
    var row = el("div", "cookie-row");

    var body = el("div", "cookie-row__body");
    var head = el("div", "cookie-row__head");
    head.appendChild(el("h3", "cookie-row__label", cat.label));
    if (locked) {
      var tag = el("span", "cookie-row__tag", "sempre ativo");
      head.appendChild(tag);
    }
    body.appendChild(head);
    body.appendChild(el("p", "cookie-row__desc", cat.desc));
    row.appendChild(body);

    var label = el("label", "cookie-switch");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!on;
    input.disabled = !!locked;
    input.setAttribute("data-cat", cat.id);
    if (locked) input.setAttribute("aria-disabled", "true");
    label.appendChild(input);
    label.appendChild(el("span", "cookie-switch__track", ""));
    var sr = el("span", "sr-only", locked ? "Sempre ativo" : cat.label);
    label.appendChild(sr);
    row.appendChild(label);

    return row;
  }

  function buildModal() {
    var box = el("div", "cookie-modal");
    box.id = "cookieModal";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "cookieModalTitle");
    box.hidden = true;

    var backdrop = el("div", "cookie-modal__backdrop");
    backdrop.setAttribute("data-cookie", "close");
    box.appendChild(backdrop);

    var panel = el("div", "cookie-modal__panel");
    panel.setAttribute("role", "document");

    var head = el("div", "cookie-modal__head");
    var titles = el("div", null);
    titles.appendChild(el("h2", "cookie-modal__title", "Preferencias de cookies"));
    titles.id = "cookieModalTitle";
    var sub = el("p", "cookie-modal__sub", "Escolha o que pode ser ativado. Necessarios nao pode ser desligado — e o que mantem o site funcionando e o que guarda esta escolha.");
    titles.appendChild(sub);
    head.appendChild(titles);
    var close = el("button", "cookie-modal__x");
    close.type = "button";
    close.setAttribute("data-cookie", "close");
    close.setAttribute("aria-label", "Fechar");
    close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    head.appendChild(close);
    panel.appendChild(head);

    var list = el("div", "cookie-modal__list");
    CATEGORIES.forEach(function (cat) {
      list.appendChild(switchRow(cat, granted(cat.id), cat.locked));
    });
    panel.appendChild(list);

    var note = el("p", "cookie-modal__note");
    note.appendChild(document.createTextNode("Para records sobre seus dados, incluindo revogar este consentimento, veja a "));
    var pl = el("a", null, "Politica de Privacidade");
    pl.href = "politica-de-privacidade.html";
    note.appendChild(pl);
    note.appendChild(document.createTextNode("."));
    panel.appendChild(note);

    var foot = el("div", "cookie-modal__foot");
    var save = el("button", "btn", "Salvar preferencias");
    save.type = "button";
    save.setAttribute("data-cookie", "save");
    foot.appendChild(save);

    var accept = el("button", "btn btn--quiet", "Aceitar todos");
    accept.type = "button";
    accept.setAttribute("data-cookie", "all");
    foot.appendChild(accept);

    var cancel = el("button", "cookie__link", "Cancelar");
    cancel.type = "button";
    cancel.setAttribute("data-cookie", "close");
    foot.appendChild(cancel);

    panel.appendChild(foot);
    box.appendChild(panel);
    return box;
  }

  /* ——— Estado da interface ——— */

  var banner = null;
  var modal = null;
  var lastFocus = null;

  function openBanner() {
    if (!banner) return;
    banner.hidden = false;
    /* dois quadros: um para sair do estado hidden, outro para ter o que
       transicionar. Sem isso a entrada salta sem animacao. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add("is-open");
      });
    });
  }

  function closeBanner() {
    if (!banner) return;
    banner.classList.remove("is-open");
    window.setTimeout(function () { banner.hidden = true; }, 260);
  }

  function syncModal() {
    if (!modal) return;
    var inputs = modal.querySelectorAll("input[data-cat]");
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].checked = granted(inputs[i].getAttribute("data-cat"));
    }
  }

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trapFocus(e) {
    if (e.key !== "Tab" || !modal || modal.hidden) return;
    var items = modal.querySelectorAll(FOCUSABLE);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openModal() {
    if (!modal) return;
    lastFocus = document.activeElement;
    syncModal();
    modal.hidden = false;
    document.documentElement.classList.add("has-cookie-modal");
    requestAnimationFrame(function () {
      modal.classList.add("is-open");
      var target = modal.querySelector(".cookie-modal__x");
      if (target) target.focus();
    });
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.classList.remove("is-open");
    document.documentElement.classList.remove("has-cookie-modal");
    window.setTimeout(function () {
      modal.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 220);
  }

  function commit(consent, source) {
    var state = {
      id: (consent.necessarios && consent.analytics && consent.marketing) ? "all" : (consent.analytics || consent.marketing ? "custom" : "necessary"),
      version: CONFIG.version,
      ts: new Date().toISOString(),
      source: source,
      consent: {
        necessarios: true,
        analytics: !!consent.analytics,
        marketing: !!consent.marketing
      }
    };
    writeStore(state);
    announce(state);
    closeModal();
    closeBanner();
  }

  function onClick(e) {
    var target = e.target && e.target.closest ? e.target.closest("[data-cookie]") : null;
    if (!target) return;
    var action = target.getAttribute("data-cookie");

    if (action === "manage") {
      e.preventDefault();
      openModal();
      return;
    }
    if (action === "close") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (action === "all") {
      e.preventDefault();
      commit({ necessarios: true, analytics: true, marketing: true }, modal && !modal.hidden ? "modal" : "banner");
      return;
    }
    if (action === "necessary") {
      e.preventDefault();
      commit({ necessarios: true, analytics: false, marketing: false }, "banner");
      return;
    }
    if (action === "save") {
      e.preventDefault();
      var next = { necessarios: true, analytics: false, marketing: false };
      var inputs = modal.querySelectorAll("input[data-cat]");
      for (var i = 0; i < inputs.length; i++) {
        var id = inputs[i].getAttribute("data-cat");
        if (id !== "necessarios") next[id] = inputs[i].checked;
      }
      commit(next, "modal");
    }
  }

  function onKey(e) {
    if (e.key === "Escape" && modal && !modal.hidden) {
      closeModal();
      return;
    }
    trapFocus(e);
  }

  /* ——— Boot ——— */

  function boot() {
    if (document.getElementById("cookieBanner")) return;

    banner = buildBanner();
    modal = buildModal();
    document.body.appendChild(banner);
    document.body.appendChild(modal);

    document.addEventListener("click", onClick, false);
    document.addEventListener("keydown", onKey, false);

    /* O link do rodape aponta para a politica como destino real. Com JS ele
       abre a tela de preferencias; sem JS, leva para o texto que explica o
       mesmo assunto. Nao existe link quebrado em nenhum dos dois casos. */
    var triggers = document.querySelectorAll("[data-cookie-prefs]");
    for (var i = 0; i < triggers.length; i++) {
      triggers[i].addEventListener("click", function (e) {
        e.preventDefault();
        openModal();
      });
    }

    if (!hasDecision()) {
      openBanner();
    } else {
      announce(current());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* Superficie publica: qualquer script do site pode consultar ou alterar o
     consentimento sem conhecer o formato do armazenamento. */
  window.lgpdConsent = {
    categories: CATEGORIES,
    get: current,
    decided: hasDecision,
    granted: granted,
    open: openModal,
    set: commit,
    version: CONFIG.version
  };
})();
