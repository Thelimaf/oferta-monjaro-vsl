/* ============================================================
   VSL Control — Player VSL (overlay click → unmuted play)
   ============================================================ */
(function () {
    'use strict';

    var CFG = window.VSL_CONFIG || {};
    var TEMPO_BOTAO = (typeof CFG.tempoExibirBotao === 'number') ? CFG.tempoExibirBotao : 600;
    var BOTAO_LINK  = CFG.botaoLink || '#';
    var VSL_ID      = CFG.vslId || 'vsl_default';
    var COOKIE_DIAS = CFG.cookieDias || 60;
    var COOKIE_KEY  = VSL_ID + '_vsl_exibiu_botao_proximo';
    var POLL_MS     = 1000;

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
        var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[$()*+./?[\\\]^{|}]/g,'\\$&') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    }

    function $btn()   { return document.querySelector('.btnProximoPasso'); }
    function $video() { return document.getElementById('vsl_video'); }

    var revelado = false;
    function revelarBotao() {
        if (revelado) return;
        revelado = true;
        var btn = $btn();
        if (btn) {
            btn.style.display = 'inline-block';
            btn.classList.add('revealed');
            btn.setAttribute('href', BOTAO_LINK);
        }
        setCookie(COOKIE_KEY, 'S', COOKIE_DIAS);
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: 'vsl_cta_revealed', vsl_id: VSL_ID });
            if (typeof window.fbq === 'function') {
                window.fbq('trackCustom', 'VSL_CTA_Revealed', { vsl_id: VSL_ID });
            }
        } catch (e) {}
    }

    function setupVslMode() {
        var video = $video();
        var wrapper = document.getElementById('videoWrapper');
        var overlay = document.getElementById('vslPlay');
        var bar = document.getElementById('vslProgressBar');
        if (!video || !wrapper) return;

        var lastTime = 0;
        var allowEnd = false;
        var started = false;

        function startPlayback() {
            if (started) return;
            started = true;
            video.muted = false;
            video.volume = 1;
            var p = video.play();
            if (p && p.catch) {
                p.catch(function () {
                    // Algumas plataformas exigem play mutado primeiro
                    video.muted = true;
                    video.play().then(function () { video.muted = false; }).catch(function(){});
                });
            }
            if (overlay) {
                overlay.classList.add('hidden');
                setTimeout(function(){ overlay.style.display = 'none'; }, 300);
            }
        }

        if (overlay) {
            overlay.addEventListener('click', startPlayback);
            overlay.addEventListener('touchstart', startPlayback, { passive: true });
        }

        // Anti-seek + atualização da barra
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
        video.addEventListener('ended', function () { allowEnd = true; });
        video.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    function startPolling() {
        if (readCookie(COOKIE_KEY) === 'S') { revelarBotao(); return; }
        var pollId = setInterval(function () {
            var v = $video();
            var t = (v && typeof v.currentTime === 'number' && !isNaN(v.currentTime)) ? v.currentTime : null;
            if (t !== null && t > TEMPO_BOTAO) {
                revelarBotao();
                clearInterval(pollId);
            }
        }, POLL_MS);
    }

    function boot() { setupVslMode(); startPolling(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.VSL = { revelarAgora: revelarBotao, config: CFG };
})();
