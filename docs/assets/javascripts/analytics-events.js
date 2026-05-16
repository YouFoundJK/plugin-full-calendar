// 1. Load Umami Script Dynamically
(function () {
    var el = document.createElement('script');
    el.setAttribute('src', 'https://analytics.destyleer.in.net/script.js');
    el.setAttribute('data-website-id', 'b18306c0-3f20-4089-baaf-bcb771cb9cd2');
    el.setAttribute('data-auto-track', 'false'); // Controlled manually for SPA transitions
    document.head.appendChild(el);
})();

// Global Helper for Custom Umami Tracking
function trackUmamiEvent(eventName, eventData) {
    if (window.umami && typeof window.umami.track === 'function') {
        window.umami.track(eventName, eventData);
    }
}

// Track Document Printing / PDF Exports (Set once globally)
window.addEventListener('beforeprint', function () {
    trackUmamiEvent('exported_pdf', { page: window.location.pathname });
});

// Hook into MkDocs Material Single Page Application lifecycle
document$.subscribe(function () {

    const currentPath = window.location.pathname;

    // 2. Track Pageviews Natively on SPA navigation
    if (window.umami && typeof window.umami.track === 'function') {
        window.umami.track();
    }

    // 3. Track Feedback Widget (Happy/Sad)
    var feedback = document.forms.feedback;
    if (typeof feedback !== "undefined") {
        feedback.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var data = ev.submitter.getAttribute("data-md-value");
            var rating = data === "1" ? "Happy" : "Sad";

            trackUmamiEvent('docs_feedback', {
                rating: rating,
                page: currentPath
            });
        });
    }

    // 4. Track "Copy to Clipboard" (FIXED: Now records the language!)
    var copyButtons = document.querySelectorAll('.md-clipboard');
    copyButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var codeBlock = btn.closest('.highlight');
            // Cleans up the class names to extract just 'python', 'bash', 'json', etc.
            var language = codeBlock ? codeBlock.className.replace('highlight', '').trim() : 'unknown';

            trackUmamiEvent('copied_code', {
                language: language,
                page: currentPath
            });
        });
    });

    // 5. Track Dark/Light Mode Toggles
    var colorToggles = document.querySelectorAll('[data-md-color-scheme]');
    colorToggles.forEach(function (toggle) {
        toggle.addEventListener('change', function (ev) {
            trackUmamiEvent('toggled_theme', {
                theme: ev.target.value
            });
        });
    });

    // 6. Track Content Tab Switching (Internal Content Tabs)
    var tabs = document.querySelectorAll('.tabbed-labels > label');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            trackUmamiEvent('switched_tab', {
                tab_name: tab.innerText.trim(),
                page: currentPath
            });
        });
    });

    // 7. Track Right-Sidebar Table of Contents (Anchor Link Tracking)
    var tocLinks = document.querySelectorAll('.md-nav__link[href^="#"]');
    tocLinks.forEach(function (link) {
        link.addEventListener('click', function () {
            trackUmamiEvent('clicked_toc_anchor', {
                anchor: link.getAttribute('href'),
                anchor_text: link.innerText.trim(),
                page: currentPath
            });
        });
    });

    // 8. Track Outbound External Links
    var allLinks = document.querySelectorAll('a[href^="http"]');
    allLinks.forEach(function (link) {
        var url = new URL(link.href);
        // Exclude your own docs domain and your github.io hosting domain
        if (url.hostname !== 'analytics.destyleer.in.net' && !url.hostname.includes('github.io')) {
            link.addEventListener('click', function () {
                trackUmamiEvent('outbound_exit', {
                    destination: link.href,
                    page: currentPath
                });
            });
        }
    });

    // 9. Track Chronological Time-on-Page Milestones
    let activeTimers = [];
    const clearActiveTimers = () => activeTimers.forEach(clearTimeout);

    const setMilestone = (seconds, label) => {
        activeTimers.push(setTimeout(() => {
            trackUmamiEvent('time_milestone', { duration: label, page: currentPath });
        }, seconds * 1000));
    };

    setMilestone(30, '30_seconds');
    setMilestone(120, '2_minutes');
    setMilestone(300, '5_minutes');

    // 10. Track Scroll Depth (90%)
    var scrollTriggered = false;
    var scrollHandler = function () {
        if (!scrollTriggered) {
            var h = document.documentElement,
                b = document.body,
                st = 'scrollTop',
                sh = 'scrollHeight';
            var percent = (h[st] || b[st]) / ((h[sh] || b[sh]) - h.clientHeight) * 100;
            if (percent >= 90) {
                scrollTriggered = true;
                trackUmamiEvent('scrolled_90', { page: currentPath });
                window.removeEventListener('scroll', scrollHandler);
            }
        }
    };
    window.addEventListener('scroll', scrollHandler);

    // 11. Track Search Keywords (With Zero Results & Page Origin Check)
    var searchInput = document.querySelector('.md-search__input');
    if (searchInput) {
        searchInput.addEventListener('blur', function () {
            var query = searchInput.value.trim();
            if (query.length > 0) {
                setTimeout(function () {
                    var meta = document.querySelector('.md-search__result-meta');
                    var zeroResults = meta && (meta.innerText.includes('0') || meta.innerText.includes('No'));

                    trackUmamiEvent('search', {
                        keyword: query,
                        status: zeroResults ? 'zero_results' : 'has_results',
                        searched_from_page: currentPath
                    });
                }, 500);
            }
        });
    }

    // Clean up timers and scroll listeners on SPA page change to prevent duplicate logs
    document$.subscribe(function () {
        clearActiveTimers();
        window.removeEventListener('scroll', scrollHandler);
    });
});