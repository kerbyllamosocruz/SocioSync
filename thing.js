// ==UserScript==
// @name         SocialBee & TikTok Auto-Comment & Login Checker bitter
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Automatically check comment options on SocialBee, auto-click specific TikTok login flows, and auto-logout.
// @author       Antigravity
// @match        https://app.socialbee.com/*
// @match        *://*.tiktok.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // --- CHECK FOR SUCCESSFUL REDIRECT ---
    // If we are currently on SocialBee AND the flag was set by TikTok, open the logout tab
    if (window.location.hostname.includes('socialbee.com')) {
        if (GM_getValue('justAuthorizedTikTok', false) === true) {
            console.log('[AutoClick] Detected return to SocialBee after TikTok auth. Opening logout tab...');

            // Reset the flag so it doesn't keep opening tabs on every page refresh
            GM_setValue('justAuthorizedTikTok', false);

            // Open the logout URL in a new tab
            GM_openInTab('https://www.tiktok.com/logout', { active: false, insert: true });
        }
    }

    // Set to keep track of elements we've already clicked to prevent spam-clicking
    const clickedElements = new WeakSet();

    function clickElement(el, logMessage) {
        if (el && !clickedElements.has(el)) {
            console.log(logMessage);
            clickedElements.add(el);
            el.click();
        }
    }

    function ensureChecked() {
        const checkboxes = document.querySelectorAll('input[name="usersCanComment"], input#usersCanComment');

        checkboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                console.log('[AutoComment] Checkbox found unchecked. Simulating interaction...');

                let label = null;
                if (checkbox.id) {
                    label = document.querySelector(`label[for="${checkbox.id}"]`);
                }
                if (!label) {
                    label = checkbox.closest('label');
                }

                if (label) {
                    label.click();
                } else {
                    checkbox.click();
                }

                setTimeout(() => {
                    if (!checkbox.checked) {
                        console.log('[AutoComment] Click failed to check. Forcing state...');
                        checkbox.checked = true;
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, 50);
            }
        });
    }

    function autoClickNavFlows() {
        // 1. SocialBee Connect TikTok Profile Button
        const profileConnectBtn = document.querySelector('form[action="/signin/tiktok"] button.button-connect');
        clickElement(profileConnectBtn, '[AutoClick] Clicked "Profile" connect button in SocialBee.');

        // 2. TikTok Login Method "Use phone / email / username"
        const channelItems = document.querySelectorAll('div[data-e2e="channel-item"]');
        channelItems.forEach(item => {
            if (item.textContent.includes('Use phone / email / username')) {
                clickElement(item, '[AutoClick] Clicked "Use phone / email / username" menu option.');
            }
        });

        // 3. TikTok "Log in with email or username" link
        const emailLoginLink = document.querySelector('a[href="/login/phone-or-email/email"]');
        clickElement(emailLoginLink, '[AutoClick] Clicked "Log in with email or username" link.');

        // 4. Force logout if we landed on the authorize page WITHOUT going through login
        //    This means TikTok already had an old session logged in and skipped the login screen.
        if (window.location.pathname.includes('/v2/auth/authorize') || window.location.pathname.includes('/auth/authorize')) {
            if (!GM_getValue('didAutomatedLogin', false) && !window._forcedLogout) {
                window._forcedLogout = true;
                console.log('[Recovery] On authorize page but never went through login. Old session detected. Force logging out...');
                GM_openInTab('https://www.tiktok.com/logout', { active: false, insert: true });
                return;
            }
        }

        // 5. TikTok "Continue" Authorization Button
        const authBtn = document.querySelector('button#auth-btn') || document.querySelector('button[type="submit"]');
        if (authBtn && !clickedElements.has(authBtn)) {
            console.log('[AutoClick] Clicked "Continue" authorization button. Setting flag for redirect...');

            // Set a cross-domain flag so the script knows we are about to redirect back to SocialBee
            GM_setValue('justAuthorizedTikTok', true);
            GM_setValue('didAutomatedLogin', false); // Clear for next account

            const lastUser = GM_getValue('lastAttemptedUsername');
            if (lastUser) {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'http://localhost:4782/mark-done',
                    data: JSON.stringify({ username: lastUser }),
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            clickedElements.add(authBtn);
            authBtn.click();
        }
    }

    let hasAttemptedLogin = false;
    let loginClickTime = 0;
    let loginRetries = 0;
    let otpScreenStartTime = 0;
    let resendCodeClicked = false;
    let lastErrorCheckTime = 0;

    function errorRecoveryFlows() {
        const now = Date.now();
        const textContent = document.body.innerText || "";

        // 1. "Something went wrong. Please try again later."
        if (textContent.includes("Something went wrong. Please try again later.")) {
            if (now - lastErrorCheckTime > 5000) {
                lastErrorCheckTime = now;
                console.log('[Recovery] Found "Something went wrong" error.');
                if (loginRetries === 0) {
                    loginRetries++;
                    const loginBtn = document.querySelector('button[data-e2e="login-button"]');
                    if (loginBtn) {
                        console.log('[Recovery] Retrying login click...');
                        if (loginBtn.hasAttribute('disabled')) loginBtn.removeAttribute('disabled');
                        loginBtn.click();
                        loginClickTime = now;
                    }
                } else {
                    console.log('[Recovery] Login failed twice. Redirecting to SocialBee...');
                    window.location.href = "https://app.socialbee.com/";
                }
            }
        }

        const resendBtn = Array.from(document.querySelectorAll('button, span, div, a')).find(el => el.textContent && el.textContent.trim().toLowerCase() === 'resend code');
        const isOtpScreen = (textContent.includes('Enter the') && textContent.includes('code')) || resendBtn;

        if (isOtpScreen && loginClickTime > 0) {
            loginClickTime = 0; // Cancel infinite loading timer since OTP modal appeared
        }

        // 2. Infinite loading (e.g. 30 seconds after clicking login)
        if (loginClickTime > 0 && (now - loginClickTime) > 30000) {
            const loginBtn = document.querySelector('button[data-e2e="login-button"]');
            if (loginBtn && loginBtn.hasAttribute('disabled')) {
                // If it's disabled, it's actively processing/loading, don't redirect yet
                // We'll just wait
            } else if (loginBtn && document.querySelector('input[name="username"]')) {
                console.log('[Recovery] Infinite loading detected. Redirecting to SocialBee...');
                window.location.href = "https://app.socialbee.com/";
            } else if (!loginBtn && !window.location.pathname.includes('/login')) {
                loginClickTime = 0;
            }
        }

        if (isOtpScreen) {
            if (otpScreenStartTime === 0) {
                otpScreenStartTime = now;
                resendCodeClicked = false;
            }
            
            // 3. OTP expired or incorrect
            if (textContent.includes("Verification code is expired or incorrect. Try again.")) {
                if (now - lastErrorCheckTime > 5000) {
                    lastErrorCheckTime = now;
                    console.log('[Recovery] Wrong OTP. Clicking resend code...');
                    if (resendBtn) resendBtn.click();
                    
                    // Attempt to clear any input fields for the fetcher to retry
                    const otpInputs = document.querySelectorAll('input[autocomplete="one-time-code"], input[type="text"]');
                    otpInputs.forEach(input => {
                        input.value = '';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                    
                    const lastResp = GM_getValue('otp_response');
                    GM_setValue('otp_invalidated', {
                        otp: (lastResp && lastResp.otp) ? lastResp.otp : null,
                        ts: Date.now()
                    });
                    
                    otpScreenStartTime = now; 
                }
            }

            // 4. Code hasn't been found for 30 seconds
            if (otpScreenStartTime > 0 && (now - otpScreenStartTime) > 30000 && !resendCodeClicked) {
                console.log('[Recovery] OTP wait timeout. Clicking resend code...');
                if (resendBtn) {
                    resendBtn.click();
                    resendCodeClicked = true;
                    otpScreenStartTime = now; 
                }
            }
        } else {
            otpScreenStartTime = 0;
        }

        // 5. Redirection failed (logged in, but stuck on TikTok homepage instead of auth)
        if (window.location.hostname.includes('tiktok.com') && 
            !window.location.pathname.includes('/login') && 
            !window.location.pathname.includes('/oauth') &&
            !window.location.pathname.includes('/logout')) {
            
            const lastAttempt = GM_getValue('lastAttemptedUsername');
            if (lastAttempt) {
                const isLoggedIn = document.querySelector('div[data-e2e="profile-icon"], img[alt*="profile"], [class*="avatar"]') !== null;
                
                let arrivedTime = GM_getValue('tiktokHomeArriveTime', 0);
                if (isLoggedIn) {
                    if (arrivedTime === 0) {
                        GM_setValue('tiktokHomeArriveTime', now);
                    } else if (now - arrivedTime > 10000) {
                        console.log('[Recovery] Logged in but not on authorization page. Account likely already linked. Marking done & opening logout tab...');
                        
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: 'http://localhost:4782/mark-done',
                            data: JSON.stringify({ username: lastAttempt }),
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        GM_setValue('tiktokHomeArriveTime', 0); 
                        GM_setValue('lastAttemptedUsername', ''); // Reset so we don't loop
                        GM_openInTab('https://www.tiktok.com/logout', { active: false, insert: true });
                    }
                } else {
                    GM_setValue('tiktokHomeArriveTime', 0);
                }
            }
        }
    }

    async function handleTikTokLogin() {
        if (hasAttemptedLogin) return;
        
        const usernameInput = document.querySelector('input[name="username"]');
        const passwordInput = document.querySelector('input[type="password"]');
        const loginBtn = document.querySelector('button[data-e2e="login-button"]');

        if (usernameInput && passwordInput && loginBtn) {
            hasAttemptedLogin = true;
            GM_setValue('didAutomatedLogin', true); // Flag that we went through login
            console.log('[AutoLogin] Detected TikTok login form. Fetching accounts from local server...');
            
            GM_xmlhttpRequest({
                method: "GET",
                url: "http://localhost:4782/accounts",
                onload: function(response) {
                    try {
                        const text = response.responseText;
                        const lines = text.split('\n')
                                          .map(line => line.trim())
                                          .filter(line => line.length > 0 && !line.startsWith('email,') && !line.includes('- Done'));
                        
                        // Keep track of which account to use
                        let currentIndex = GM_getValue('currentAccountIndex', 0);
                        if (currentIndex >= lines.length) {
                            currentIndex = 0; // wrap around when we reach the end
                        }
                        
                        const accountLine = lines[currentIndex];
                        if (!accountLine) return; // No accounts left
                        
                        // Support comma separation
                        const parts = accountLine.split(',');
                        const username = parts[0];
                        const password = parts[1];
                        
                        if (username && password) {
                            console.log(`[AutoLogin] Attempting login with account index ${currentIndex} (${username})`);
                            
                            GM_setValue('lastAttemptedUsername', username);
                            
                            // Increment for next time
                            GM_setValue('currentAccountIndex', currentIndex + 1);
                            
                            // Helper to set React input value bypassing React's event pooling/virtual DOM hooks
                            const setNativeValue = (element, value) => {
                                element.focus(); // Focus helps trigger React state
                                const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
                                const prototype = Object.getPrototypeOf(element);
                                const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                                
                                if (valueSetter && valueSetter !== prototypeValueSetter) {
                                    prototypeValueSetter.call(element, value);
                                } else if (valueSetter) {
                                    valueSetter.call(element, value);
                                } else {
                                    element.value = value;
                                }
                                element.dispatchEvent(new Event('input', { bubbles: true }));
                                element.dispatchEvent(new Event('change', { bubbles: true }));
                                element.blur();
                            };
                            
                            setNativeValue(usernameInput, username);
                            setTimeout(() => {
                                setNativeValue(passwordInput, password);
                                setTimeout(() => {
                                    if (loginBtn.hasAttribute('disabled')) {
                                        loginBtn.removeAttribute('disabled');
                                    }
                                    console.log('[AutoLogin] Clicking login button');
                                    loginRetries = 0;
                                    loginBtn.click();
                                    loginClickTime = Date.now();
                                }, 800);
                            }, 500);
                        }
                        
                    } catch (err) {
                        console.error('[AutoLogin] Failed to parse accounts:', err);
                        hasAttemptedLogin = false; // allow retry if failed
                    }
                },
                onerror: function(err) {
                    console.error('[AutoLogin] Failed to fetch accounts (CORS/Network error):', err);
                    hasAttemptedLogin = false; // allow retry if failed
                }
            });
        }
    }

    // Run every 300ms to handle dynamic content loading and state resets
    setInterval(() => {
        ensureChecked();
        autoClickNavFlows();
        errorRecoveryFlows();
        handleTikTokLogin();
    }, 300);
})();