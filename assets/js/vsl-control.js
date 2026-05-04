/* ============================================================
   VSL Control — Lógica de revelação do botão CTA
   Detecta automaticamente o tipo de player:
   - <video> HTML5 nativo
   - VTurb / smartplayer (window.smartplayer.instances[0].video)
   - iframe (Panda/Vimeo/YouTube) -> usa timer absoluto desde load
   ============================================================ */
(function () {
    'use strict';

    var CFG = window.VSL_CONFIG || {};
    var TEMPO_BOTAO = (typeof CFG.tempoExibirBotao === 'number') ? CFG.tempoExibirBotao : 600;
    var BOTAO_LINK  = CFG.botaoLink || '#';
    var VSL_ID      = CFG.vslId || 'vsl_default';
    var COOKIE_DIAS = CFG.cookieDias || 60;
    var COOKIE_KEY  = VSL_ID + '_vsl_exibiu_botao_proximo';
    var POLL_MS     = 1000; // polling de 1s (mais preciso que os 5s do original)

    /* --------- Cookie helpers (mesmo padrão da página de referência) --------- */
    function setCookie(name, value, days) {
        var expires = '';
        if (days) {
            var d = new Date();
            d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
            expires = '; expires=' + d.toUTCString();
        }
        document.cookie = name + '=' + value + expires + '; path=/; SameSite=Lax';
    }

    function readCookie(name) {
        var nameEQ = name + '=';
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    /* --------- DOM refs --------- */
    function $btn()   { return document.querySelector('.btnProximoPasso'); }
    function $sub()   { return document.querySelector('.btn-subtitle'); }
    function $video() { return document.getElementById('vsl_video'); }
    function $iframe(){ return document.getElementById('vsl_iframe'); }

    /* --------- Reveal --------- */
    var revelado = false;
    function revelarBotao() {
        if (revelado) return;
        revelado = true;
        var btn = $btn();
        var sub = $sub();
        if (btn) {
            btn.style.display = 'inline-block';
            btn.classList.add('revealed');
            btn.setAttribute('href', BOTAO_LINK);
        }
        if (sub) sub.style.display = 'block';
        setCookie(COOKIE_KEY, 'S', COOKIE_DIAS);

        // Dispara evento custom para tracking (GTM/Pixel)
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: 'vsl_cta_revealed', vsl_id: VSL_ID });
            if (typeof window.fbq === 'function') {
                window.fbq('trackCustom', 'VSL_CTA_Revealed', { vsl_id: VSL_ID });
            }
        } catch (e) {}
    }

    /* --------- Detecção de player + polling --------- */
    function getCurrentTimeFromAnyPlayer() {
        // VTurb / smartplayer
        if (window.smartplayer && window.smartplayer.instances && window.smartplayer.instances[0]) {
            var inst = window.smartplayer.instances[0];
            if (inst.video && typeof inst.video.currentTime === 'number') {
                return inst.video.currentTime;
            }
        }
        // HTML5 <video>
        var v = $video();
        if (v && typeof v.currentTime === 'number' && !isNaN(v.currentTime)) {
            return v.currentTime;
        }
        // iframe (sem API postMessage configurada) -> retorna null para usar fallback
        return null;
    }

    function startPolling() {
        // Se o cookie indica que já viu o botão, revela imediatamente
        if (readCookie(COOKIE_KEY) === 'S') {
            revelarBotao();
            return;
        }

        var iframeFallbackStart = null;
        var pollId = setInterval(function () {
            var t = getCurrentTimeFromAnyPlayer();

            // Se não há player detectável e existe iframe, usa timer absoluto
            if (t === null && $iframe()) {
                if (iframeFallbackStart === null) iframeFallbackStart = Date.now();
                t = (Date.now() - iframeFallbackStart) / 1000;
            }

            if (t !== null && t > TEMPO_BOTAO) {
                revelarBotao();
                clearInterval(pollId);
            }
        }, POLL_MS);
    }

    /* --------- Modo VSL (sem controles, sem pause, sem seek) --------- */
    function setupVslMode() {
        var video = $video();
        var wrapper = document.getElementById('videoWrapper');
        var overlay = document.getElementById('vslUnmute');
        var bar = document.getElementById('vslProgressBar');
        if (!video || !wrapper || !wrapper.classList.contains('vsl-mode')) return;

        var lastTime = 0;        // controla o anti-seek
        var allowEnd = false;    // libera pause natural quando vídeo acaba

        // Autoplay mutado (única forma garantida em mobile)
        var tryPlay = function () {
            var p = video.play();
            if (p && p.catch) p.catch(function(){ /* silencioso, usuário pode precisar interagir */ });
        };
        video.addEventListener('loadedmetadata', tryPlay);
        video.addEventListener('canplay', tryPlay);

        // Click no overlay → desmuta e garante play
        if (overlay) {
            overlay.addEventListener('click', function () {
                video.muted = false;
                video.volume = 1;
                tryPlay();
                overlay.classList.add('hidden');
                setTimeout(function(){ overlay.style.display = 'none'; }, 300);
            });
        }

        // Anti-seek: se o usuário tentar pular pra frente/trás, volta pro último tempo conhecido
        video.addEventListener('timeupdate', function () {
            var t = video.currentTime;
            if (t > lastTime + 1.5) { video.currentTime = lastTime; }
            else { lastTime = t; }
            if (bar && video.duration) {
                bar.style.width = (t / video.duration * 100).toFixed(2) + '%';
            }
        });
        video.addEventListener('seeking', function () {
            if (Math.abs(video.currentTime - lastTime) > 1.5 && !allowEnd) {
                video.currentTime = lastTime;
            }
        });

        // Anti-pause: se o vídeo for pausado (não pelo fim), retoma
        video.addEventListener('pause', function () {
            if (!allowEnd && !video.ended) tryPlay();
        });
        video.addEventListener('ended', function () { allowEnd = true; });

        // Bloqueia menu de contexto e atalhos de teclado no player
        video.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        document.addEventListener('keydown', function (e) {
            var blocked = [' ', 'k', 'K', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'f', 'F', 'm', 'M'];
            if (blocked.indexOf(e.key) !== -1 && document.activeElement === document.body) {
                e.preventDefault();
            }
        });
    }

    /* --------- Boot --------- */
    function boot() {
        setupVslMode();
        startPolling();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    /* --------- API debug (console) --------- */
    window.VSL = {
        revelarAgora: revelarBotao,
        config: CFG,
        getTime: getCurrentTimeFromAnyPlayer
    };
})();
