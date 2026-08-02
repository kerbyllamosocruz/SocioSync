// Background Service Worker for SocialBee & TikTok Automation Suite

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GM_xmlhttpRequest") {
    const { method = "GET", url, headers = {}, data } = request.details;

    fetch(url, {
      method: method,
      headers: headers,
      body: (method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD") ? undefined : data
    })
      .then(async (response) => {
        const status = response.status;
        const statusText = response.statusText;
        let responseText = "";
        let responseJson = null;

        try {
          responseText = await response.text();
          if (request.details.responseType === "json") {
            try {
              responseJson = JSON.parse(responseText);
            } catch (e) {}
          }
        } catch (e) {}

        sendResponse({
          success: true,
          response: {
            status,
            statusText,
            responseText,
            response: responseJson || responseText
          }
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message || String(error)
        });
      });

    return true; // Keep message channel open for async response
  }

  if (request.type === "GM_openInTab") {
    chrome.tabs.create(
      {
        url: request.url,
        active: request.options?.active ?? false
      },
      (tab) => {
        sendResponse({ success: true, tabId: tab.id });
      }
    );
    return true;
  }
});
