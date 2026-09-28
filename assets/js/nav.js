/* ==========================================================================
   Gabriel Ferreira - navegacao

   Menu hamburguer (celular) e o item "Servicos".

   Fica num arquivo proprio, e nao dentro de main.js/pagina.js, porque os
   dois precisam dele e o codigo e o mesmo nas 10 paginas. A unica outra
   opcao seria duplicar ~70 linhas em dois arquivos.

   O site tem duas entradas de menu diferentes: a home usa .nav (barra fixa)
   e as paginas internas usam .site-head (cabecalho sticky). O painel e o
   mesmo (.mmenu) nas duas, entao este codigo nao precisa saber qual e qual.
   ========================================================================== */

(function () {
  "use strict";

  var burger = document.querySelector(".burger");
  var panel = document.getElementById("mmenu");

  /* --------------------------------------------------------------------
     Painel mobile

     O painel contem apenas as navegacoes. Nao ha cabecalho nem botao de
     fechar dentro dele: o nome do psicologo e o proprio hamburguer ficam na
     barra de cima, fora do menu, e e o hamburguer que fecha (virando X).

     A troca de visibilidade usa o atributo [hidden] e nao uma classe: com
     [hidden] o navegador tira o painel da arvore de acessibilidade e do
     tabulamento enquanto ele esta fechado, e nao existe o risco de o painel
     ficar "invisivel mas focavel" se o JS falhar no meio.
     -------------------------------------------------------------------- */

  if (burger && panel) {
    var scrollSaved = 0;

    function setMenu(on) {
      burger.setAttribute("aria-expanded", on ? "true" : "false");
      burger.setAttribute("aria-label", on ? "Fechar menu" : "Abrir menu");
      panel.hidden = !on;

      /* A classe sai ANTES do scrollTo de baixo. Se ainda estivesse aplicada,
         o body continuaria position: fixed e o scrollTo seria ignorado. */
      document.body.classList.toggle("is-menu-open", on);

      if (on) {
        scrollSaved = window.pageYOffset;
      } else if (window.pageYOffset !== scrollSaved) {
        /* O CSS trava o fundo com body { position: fixed }. Tirar a trava
           devolve o documento ao fluxo, e sem restaurar a posicao aqui a
           rolagem do celular voltaria para o topo ao fechar. Nos links com
           # isso nao atrapalha: o salto para a ancora e o passo seguinte,
           feito pelo navegador, e roda depois deste retorno. */
        window.scrollTo(0, scrollSaved);
      }
    }

    /* O foco ja esta no hamburguer quando o menu abre, entao nao ha para onde
       levar: ele acaba de virar o X, e e dali que o Tab entra no painel. */
    burger.addEventListener("click", function () {
      setMenu(burger.getAttribute("aria-expanded") !== "true");
    });

    /* Clique em qualquer link do painel fecha. Nos links com # isso importa:
       sem fechar, o goto da ancora aconteceria por baixo do painel aberto. */
    panel.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (e) {
      if (panel.hidden) return;

      if (e.key === "Escape") {
        setMenu(false);
        return;
      }

      if (e.key === "Tab") {
        var f = panel.querySelectorAll("a[href], button:not([disabled])");
        if (!f.length) return;
        /* O hamburguer fica fora do painel, mas e ele que fecha o menu.
           Entra no ciclo senao o Tab ficaria preso nos links, sem volta
           para o X. */
        var first = burger;
        var last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    /* Voltou para desktop: fecha. Sem isso o body ficaria travado em
       position: fixed, sem botao visivel para sair do menu. */
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900 && !panel.hidden) {
        setMenu(false);
        burger.focus();
      }
    });
  }

  /* --------------------------------------------------------------------
     Item "Servicos" no desktop

     Abre por hover e por :focus-within no CSS, sem JS. O clique existe
     para quem usa touch ou tecnologia assistiva, e para ter um
     aria-expanded que o CSS sozinho nao consegue dar.
     -------------------------------------------------------------------- */

  var svcBtn = document.querySelector(".nav__link--btn");
  var svcItem = svcBtn ? svcBtn.closest(".nav__item") : null;
  var svcDrop = svcItem ? svcItem.querySelector(".nav__drop") : null;

  if (svcBtn && svcItem && svcDrop) {
    function setDrop(on) {
      svcItem.classList.toggle("is-open", on);
      svcBtn.setAttribute("aria-expanded", on ? "true" : "false");
    }

    svcBtn.addEventListener("click", function () {
      setDrop(!svcItem.classList.contains("is-open"));
    });

    /* Clique fora fecha. */
    document.addEventListener("click", function (e) {
      if (svcItem.classList.contains("is-open") && !svcItem.contains(e.target)) {
        setDrop(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && svcItem.classList.contains("is-open")) {
        setDrop(false);
        svcBtn.focus();
      }
    });
  }
})();
