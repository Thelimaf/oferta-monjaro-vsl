/* ============================================================
   QUIZ Engine — single SPA, sem framework
   - Navegação prev/next entre .quiz-step
   - Validação por step (input required + multi-choice required)
   - Anti-skip (não avança sem responder)
   - Progress bar via data-progress no step ativo
   - Persistência local (recupera respostas se recarregar)
   - Tracking via dataLayer + window.fbq (se existir)
   ============================================================ */
(function () {
    'use strict';

    var CFG = window.QUIZ_CONFIG || {};
    var STORAGE_KEY = CFG.storageKey || 'quiz_respostas';
    var QUIZ_ID = CFG.quizId || 'quiz_default';
    var LINK_FINAL = CFG.linkFinal || '/';
    var COR = CFG.corPrimaria;

    // Aplica cor primária via CSS var (caso queira sobrescrever via config)
    if (COR) document.documentElement.style.setProperty('--quiz-primary', COR);

    var stepsEl = document.querySelectorAll('.quiz-step');
    var progressBar = document.getElementById('quizProgressBar');
    var progressPct = document.getElementById('quizProgressPct');
    var btnPrev = document.getElementById('quizPrev');
    var btnNext = document.getElementById('quizNext');

    var totalSteps = stepsEl.length;
    var currentStep = 0; // index 0-based

    // Carrega respostas salvas
    var respostas = {};
    try {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) respostas = JSON.parse(saved);
    } catch (e) {}

    function salvar() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(respostas)); } catch (e) {}
    }

    function trackEvent(name, data) {
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(Object.assign({ event: name, quiz_id: QUIZ_ID }, data || {}));
            if (typeof window.fbq === 'function') window.fbq('trackCustom', name, data || {});
        } catch (e) {}
    }

    function setProgress(pct) {
        if (!progressBar) return;
        progressBar.style.width = pct + '%';
        if (progressPct) progressPct.textContent = pct + '%';
    }

    function showStep(index) {
        // remove qualquer mensagem de erro pendente
        var oldErr = document.querySelector('.quiz-error-msg');
        if (oldErr) oldErr.remove();

        stepsEl.forEach(function (el, i) {
            el.classList.toggle('active', i === index);
        });

        var active = stepsEl[index];
        var pct = parseInt(active.getAttribute('data-progress') || '0', 10);
        setProgress(pct);

        // Botões
        btnPrev.hidden = (index === 0);

        var isLast = (index === totalSteps - 1);
        btnNext.textContent = isLast ? 'Avançar' : 'Próximo';

        // Pré-preenche valor salvo
        restaurarResposta(active);

        currentStep = index;

        trackEvent('quiz_step_view', { step: index + 1, progress: pct });

        // Foco automático no input (se houver)
        var input = active.querySelector('.quiz-input');
        if (input) setTimeout(function(){ input.focus(); }, 200);

        // Scroll suave pro topo do quiz
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showError(msg, anchor) {
        var existing = document.querySelector('.quiz-error-msg');
        if (existing) existing.remove();
        var el = document.createElement('div');
        el.className = 'quiz-error-msg';
        el.textContent = msg;
        var step = anchor || stepsEl[currentStep];
        step.appendChild(el);
        setTimeout(function(){ if (el.parentNode) el.remove(); }, 4000);
    }

    function validarStep(step) {
        // Tipo 1: input required
        var input = step.querySelector('.quiz-input[data-required="true"]');
        if (input) {
            var val = (input.value || '').trim();
            if (!val) {
                input.classList.add('error');
                showError('Por favor, preencha o campo para continuar.', step);
                input.focus();
                return null;
            }
            // valida min/max numérico se for number
            if (input.type === 'number') {
                var num = parseFloat(val);
                var min = parseFloat(input.min);
                var max = parseFloat(input.max);
                if (isNaN(num) || (!isNaN(min) && num < min) || (!isNaN(max) && num > max)) {
                    input.classList.add('error');
                    showError('Valor fora do intervalo permitido.', step);
                    input.focus();
                    return null;
                }
            }
            input.classList.remove('error');
            return { name: input.name, value: val };
        }

        // Tipo 2: multi-choice (.quiz-options[data-required="true"])
        var optGroup = step.querySelector('.quiz-options[data-required="true"]');
        if (optGroup) {
            var selected = optGroup.querySelector('.quiz-option.selected');
            if (!selected) {
                showError('Selecione uma opção para continuar.', step);
                return null;
            }
            return { name: optGroup.getAttribute('data-name'), value: selected.getAttribute('data-value') };
        }

        // Step sem campos (welcome / final) — sempre válido
        return { name: null, value: null };
    }

    function restaurarResposta(step) {
        var input = step.querySelector('.quiz-input');
        if (input && respostas[input.name] !== undefined) {
            input.value = respostas[input.name];
        }
        var optGroup = step.querySelector('.quiz-options');
        if (optGroup) {
            var name = optGroup.getAttribute('data-name');
            if (respostas[name]) {
                var match = optGroup.querySelector('.quiz-option[data-value="' + respostas[name] + '"]');
                optGroup.querySelectorAll('.quiz-option').forEach(function(o){ o.classList.remove('selected'); });
                if (match) match.classList.add('selected');
            }
        }
    }

    /* ===== Eventos ===== */

    // Click em opção multi-choice
    document.addEventListener('click', function (e) {
        var opt = e.target.closest('.quiz-option');
        if (!opt) return;
        var group = opt.closest('.quiz-options');
        if (!group) return;
        group.querySelectorAll('.quiz-option').forEach(function(o){ o.classList.remove('selected'); });
        opt.classList.add('selected');
    });

    // Enter no input avança
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('quiz-input')) {
            e.preventDefault();
            btnNext.click();
        }
    });

    // Botão próximo
    btnNext.addEventListener('click', function () {
        var step = stepsEl[currentStep];
        var resp = validarStep(step);
        if (resp === null) return;
        if (resp.name) {
            respostas[resp.name] = resp.value;
            salvar();
        }

        if (currentStep === totalSteps - 1) {
            // Último step → finaliza
            trackEvent('quiz_completed', { respostas: respostas });
            // Anexa respostas como query string ao link final
            var query = Object.keys(respostas).map(function(k){
                return encodeURIComponent(k) + '=' + encodeURIComponent(respostas[k]);
            }).join('&');
            var url = LINK_FINAL + (LINK_FINAL.indexOf('?') >= 0 ? '&' : '?') + query;
            window.location.href = url;
            return;
        }

        showStep(currentStep + 1);
    });

    // Botão anterior
    btnPrev.addEventListener('click', function () {
        if (currentStep > 0) showStep(currentStep - 1);
    });

    /* ===== Boot ===== */
    showStep(0);
    trackEvent('quiz_started', {});

    /* ===== API debug ===== */
    window.QUIZ = {
        respostas: function () { return respostas; },
        ir: showStep,
        reset: function () {
            respostas = {};
            salvar();
            showStep(0);
        }
    };
})();
