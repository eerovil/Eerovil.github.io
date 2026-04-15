// Google Photos Picker API (2025+): users choose photos in Google’s UI; your app
// then reads only those items. Listing the entire library in code is no longer supported.
var CLIENT_ID =
  "734651298434-6lukaeulk76bjmj4pkv456lt1bbd1f8v.apps.googleusercontent.com";
var SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
var tokenClient;

var pickedMediaItems = [];
var mediaListOffset = 0;

function initClient() {
  gapi.client
    .init({})
    .then(function () {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: function (tokenResponse) {
          if (tokenResponse && tokenResponse.error) {
            console.error(tokenResponse);
            return;
          }
          if (tokenResponse && tokenResponse.access_token) {
            gapi.client.setToken(tokenResponse);
            setSigninStatus();
          }
        },
      });

      $("#sign-in-or-out-button").click(function () {
        handleAuthClick();
      });
      $("#revoke-access-button").click(function () {
        revokeAccess();
      });
      $("#pick-photos-button").click(function () {
        startPickerFlow();
      });

      setSigninStatus();
    })
    .catch(function (err) {
      console.error("gapi.client.init failed", err);
    });
}

function getAccessToken() {
  var t = gapi.client.getToken();
  return t && t.access_token ? t.access_token : null;
}

// Picker base URLs must be fetched with OAuth; plain <img src> has no Bearer token → 403.
function revokePickerBlob(el) {
  if (el && el._pickerBlobUrl) {
    URL.revokeObjectURL(el._pickerBlobUrl);
    el._pickerBlobUrl = null;
  }
}

function fetchPickerMediaBlobUrl(fullUrl) {
  var tok = getAccessToken();
  if (!tok) {
    return Promise.reject(new Error("Not signed in"));
  }
  return fetch(fullUrl, {
    headers: { Authorization: "Bearer " + tok },
  })
    .then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error("Media fetch " + r.status + ": " + (t || r.statusText));
        });
      }
      return r.blob();
    })
    .then(function (blob) {
      return URL.createObjectURL(blob);
    });
}

function handleAuthClick() {
  var token = gapi.client.getToken();
  if (token && token.access_token) {
    gapi.client.setToken("");
    pickedMediaItems = [];
    resetPhotosGrid();
    setSigninStatus();
  } else {
    tokenClient.requestAccessToken({ prompt: "" });
  }
}

function revokeAccess() {
  var token = gapi.client.getToken();
  if (token && token.access_token) {
    google.accounts.oauth2.revoke(token.access_token, function () {
      gapi.client.setToken("");
      pickedMediaItems = [];
      resetPhotosGrid();
      setSigninStatus();
    });
  }
}

function setSigninStatus() {
  var token = gapi.client.getToken();
  var isAuthorized = token && token.access_token;
  if (isAuthorized) {
    $("#sign-in-or-out-button").css("display", "none");
    $("#revoke-access-button").css("display", "none");
    $("#pick-photos-button").css("display", "inline-block");
    $("#auth-status").html(
      '<span style="color:#888;font-size:12px;">' +
        "Sign in, then choose photos. Google opens Photos so you can pick from your full library (up to 2000 per session)." +
        "</span>"
    );
  } else {
    $("#sign-in-or-out-button").css("display", "inline-block");
    $("#sign-in-or-out-button").html("Sign In/Authorize");
    $("#pick-photos-button").css("display", "none");
    $("#revoke-access-button").css("display", "none");
    $("#auth-status").html(
      "You have not authorized this app or you are signed out."
    );
  }
}

function parseDurationToMs(s) {
  if (!s) {
    return 2000;
  }
  var m = /^([0-9.]+)s$/.exec(s);
  return m ? Math.max(500, parseFloat(m[1]) * 1000) : 2000;
}

function withAutoclosePickerUri(pickerUri) {
  if (!pickerUri) {
    return pickerUri;
  }
  try {
    var u = new URL(pickerUri);
    u.pathname = u.pathname.replace(/\/?$/, "") + "/autoclose";
    return u.toString();
  } catch (e) {
    return pickerUri;
  }
}

function normalizePickerItem(picked) {
  var file = picked.mediaFile || {};
  return {
    id: picked.id,
    mimeType: file.mimeType || "",
    baseUrl: file.baseUrl || "",
  };
}

function pollSessionUntilReady(sessionId) {
  var deadline = Date.now() + 20 * 60 * 1000;
  return new Promise(function (resolve, reject) {
    function poll() {
      if (Date.now() > deadline) {
        reject(new Error("Timed out waiting for photo selection."));
        return;
      }
      var tok = getAccessToken();
      if (!tok) {
        reject(new Error("Not signed in."));
        return;
      }
      fetch(
        "https://photospicker.googleapis.com/v1/sessions/" +
          encodeURIComponent(sessionId),
        { headers: { Authorization: "Bearer " + tok } }
      )
        .then(function (r) {
          return r.json().then(function (sess) {
            if (!r.ok) {
              throw sess.error || sess;
            }
            return sess;
          });
        })
        .then(function (sess) {
          if (sess.mediaItemsSet) {
            resolve(sess);
            return;
          }
          var interval = 2000;
          if (sess.pollingConfig && sess.pollingConfig.pollInterval) {
            interval = parseDurationToMs(sess.pollingConfig.pollInterval);
          }
          setTimeout(poll, interval);
        })
        .catch(reject);
    }
    poll();
  });
}

function fetchAllPickedMediaItems(sessionId) {
  var tok = getAccessToken();
  if (!tok) {
    return Promise.reject(new Error("Not signed in."));
  }
  var all = [];
  function nextPage(pageToken) {
    var url =
      "https://photospicker.googleapis.com/v1/mediaItems?sessionId=" +
      encodeURIComponent(sessionId) +
      "&pageSize=100";
    if (pageToken) {
      url += "&pageToken=" + encodeURIComponent(pageToken);
    }
    return fetch(url, {
      headers: { Authorization: "Bearer " + tok },
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) {
            throw data.error || data;
          }
          return data;
        });
      })
      .then(function (data) {
        if (data.mediaItems && data.mediaItems.length) {
          all = all.concat(data.mediaItems);
        }
        if (data.nextPageToken) {
          return nextPage(data.nextPageToken);
        }
        return all;
      });
  }
  return nextPage(null);
}

function deletePickerSession(sessionId) {
  var tok = getAccessToken();
  if (!tok) {
    return Promise.resolve();
  }
  return fetch(
    "https://photospicker.googleapis.com/v1/sessions/" +
      encodeURIComponent(sessionId),
    {
      method: "DELETE",
      headers: { Authorization: "Bearer " + tok },
    }
  );
}

function resetPhotosGrid() {
  for (var i = 0; i < all_containers.length; i++) {
    for (var j = 0; j < all_containers[i].length; j++) {
      var c = all_containers[i][j];
      if (c.img) {
        revokePickerBlob(c.img);
      }
    }
  }
  $("#photos_list").empty();
  all_containers = [];
  mediaListOffset = 0;
}

function startPickerFlow() {
  var tok = getAccessToken();
  if (!tok) {
    alert("Please sign in first.");
    return;
  }
  $("#pick-photos-button").prop("disabled", true);
  $("#auth-status").html(
    '<span style="color:#888;font-size:12px;">Opening Google Photos…</span>'
  );

  fetch("https://photospicker.googleapis.com/v1/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + tok,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pickingConfig: { maxItemCount: "2000" },
    }),
  })
    .then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) {
          throw body.error || body;
        }
        return body;
      });
    })
    .then(function (session) {
      var openUri = withAutoclosePickerUri(session.pickerUri);
      window.open(openUri, "_blank", "noopener,noreferrer");
      return pollSessionUntilReady(session.id).then(function () {
        return session.id;
      });
    })
    .then(function (sessionId) {
      return fetchAllPickedMediaItems(sessionId).then(function (items) {
        return { sessionId: sessionId, items: items };
      });
    })
    .then(function (result) {
      return deletePickerSession(result.sessionId).then(function () {
        return result.items;
      });
    })
    .then(function (items) {
      pickedMediaItems = items.map(normalizePickerItem);
      resetPhotosGrid();
      $("#auth-status").html(
        '<span style="color:#888;font-size:12px;">' +
          pickedMediaItems.length +
          " photo(s) selected. Scroll to load more thumbnails." +
          "</span>"
      );
      while (
        document.body.scrollTop >= document.body.scrollHeight - 1500 &&
        mediaListOffset < pickedMediaItems.length
      ) {
        listPhotos();
      }
      if (mediaListOffset < pickedMediaItems.length) {
        listPhotos();
      }
    })
    .catch(function (e) {
      console.error(e);
      var msg =
        (e && e.message) ||
        (e && e.status) ||
        (typeof e === "string" ? e : JSON.stringify(e));
      alert("Picker error: " + msg);
      setSigninStatus();
    })
    .then(function () {
      $("#pick-photos-button").prop("disabled", false);
    });
}

var currentMediaItem = null;

function setPhoto(mediaItem) {
  const photo_big = document.getElementById("photo_big");
  const photo_overlay = document.getElementById("photo_overlay");
  if (mediaItem == null) {
    if (!get_prevent_taps()) {
      return;
    }
    currentMediaItem = mediaItem;
    if (photo_big.firstChild) {
      revokePickerBlob(photo_big.firstChild);
      photo_big.removeChild(photo_big.firstChild);
    }
    photo_big.classList.add("hidden");
    photo_overlay.classList.add("hidden");
    return;
  }
  currentMediaItem = mediaItem;
  photo_big.classList.remove("hidden");
  photo_overlay.classList.remove("hidden");
  let el;
  if (mediaItem.mimeType.indexOf("image/") === 0) {
    el = document.createElement("img");
    el.id = mediaItem.id;
    if (photo_big.firstChild) {
      revokePickerBlob(photo_big.firstChild);
      photo_big.replaceChild(el, photo_big.firstChild);
    } else {
      photo_big.appendChild(el);
    }
    fetchPickerMediaBlobUrl(buildFullUrl(mediaItem))
      .then(function (blobUrl) {
        revokePickerBlob(el);
        el._pickerBlobUrl = blobUrl;
        el.src = blobUrl;
      })
      .catch(function (e) {
        console.error(e);
      });
    return;
  }
  if (mediaItem.mimeType.indexOf("video/") === 0) {
    el = document.createElement("video");
    el.autoplay = true;
    el.controls = "true";
    el.loop = "true";
    el.height = window.innerHeight;
    el.width = window.innerWidth;
    el.id = mediaItem.id;
    el.addEventListener("loadstart", function () {
      photo_big.classList.add("loading");
      photo_big.poster = "";
    });
    el.addEventListener("canplay", function () {
      photo_big.classList.remove("loading");
      photo_big.poster = "";
    });
    if (photo_big.firstChild) {
      revokePickerBlob(photo_big.firstChild);
      photo_big.replaceChild(el, photo_big.firstChild);
    } else {
      photo_big.appendChild(el);
    }
    fetchPickerMediaBlobUrl(mediaItem.baseUrl + "=dv")
      .then(function (blobUrl) {
        revokePickerBlob(el);
        el._pickerBlobUrl = blobUrl;
        el.src = blobUrl;
      })
      .catch(function (e) {
        console.error(e);
      });
    return;
  }
}

function getMediaItem(mediaItem, next) {
  let prev = null;
  let return_next = false;
  for (let i = 0; i < all_containers.length; i++) {
    for (let j = 0; j < all_containers[i].length; j++) {
      const container = all_containers[i][j];
      if (return_next) {
        return container.mediaItem;
      }
      if (container.mediaItem == mediaItem) {
        if (next) {
          return_next = true;
        } else {
          return prev;
        }
      }
      prev = container.mediaItem;
    }
  }
}

function buildFullUrl(mediaItem) {
  return mediaItem.baseUrl + "=w2048-h1024";
}
function thumbnail(mediaItem) {
  return mediaItem.baseUrl + "=w256-h256-c";
}

class queueObj {
  constructor() {
    this.queue = [];
    this.running = false;
  }
  addToQueue(item) {
    this.queue.push(item);
    this.run();
  }
  run() {
    if (this.running || this.queue.length == 0) {
      return;
    }
    this.running = true;
    const item = this.queue.pop();
    this.handleItem(item);
  }
  handleItem(item) {
    const self = this;
    const img = item.el;
    const url = thumbnail(item.mediaItem);
    fetchPickerMediaBlobUrl(url)
      .then(function (blobUrl) {
        revokePickerBlob(img);
        img._pickerBlobUrl = blobUrl;
        var finished = false;
        function done() {
          if (finished) {
            return;
          }
          finished = true;
          self.deQueue();
        }
        img.onload = done;
        img.onerror = done;
        img.src = blobUrl;
        if (img.complete && img.naturalWidth) {
          done();
        }
      })
      .catch(function (e) {
        console.error(e);
        self.deQueue();
      });
  }
  deQueue() {
    this.running = false;
    this.run();
  }
}
thumbnailQueue = new queueObj();

function loadContainer(container) {
  if (container.loaded || container.a == undefined) {
    return;
  }
  console.log("loadcontainer " + container);
  const el = container.a;
  let img = document.createElement("IMG");
  thumbnailQueue.addToQueue({ el: img, mediaItem: container.mediaItem });
  el.appendChild(img);
  if (container.element == undefined) {
    container.element = document.createElement("div");
    console.log("WARNING: containers list is empty");
  }
  container.element.appendChild(el);
  container.img = img;
  container.loaded = true;
}
function unloadContainer(container) {
  if (!container.loaded) {
    return;
  }
  console.log("unloadcontainer " + container);
  revokePickerBlob(container.img);
  container.a.removeChild(container.img);
  container.loaded = false;
}

function isScrolledIntoView(el) {
  var rect = el.getBoundingClientRect();
  var elemTop = rect.top;
  var elemBottom = rect.bottom;

  var isVisible = elemBottom >= 0 && elemTop <= window.innerHeight;
  return isVisible;
}

var all_containers = [];

var prevent_taps = false;
function get_prevent_taps() {
  if (prevent_taps) {
    return false;
  }
  prevent_taps = true;
  setTimeout(function () {
    prevent_taps = false;
  }, 500);
  return true;
}

function listPhotos() {
  if (pickedMediaItems.length === 0) {
    return;
  }
  if (mediaListOffset >= pickedMediaItems.length) {
    return;
  }
  const chunk = pickedMediaItems.slice(
    mediaListOffset,
    mediaListOffset + 100
  );
  mediaListOffset += chunk.length;
  const photos_list = document.getElementById("photos_list");
  let subcontainers = [];
  for (let i = 0; i < chunk.length; i++) {
    let container = document.createElement("div");
    photos_list.appendChild(container);
    subcontainers.push({ element: container });
  }
  all_containers.push(subcontainers);

  for (let i = 0; i < chunk.length; i++) {
    let mediaItem = chunk[i];
    let el = document.createElement("a");
    el.href = "#";
    el.onclick = function (event) {
      if (!get_prevent_taps()) {
        return;
      }

      event.preventDefault();
      setPhoto(mediaItem);
      return false;
    };
    const container = subcontainers[i];
    container.mediaItem = mediaItem;
    container.element.appendChild(el);
    container.a = el;
    if (isScrolledIntoView(container.element)) {
      loadContainer(container);
    }
  }
  console.log("listPhotos chunk, total offset " + mediaListOffset);
}

window.onscroll = function (ev) {
  if (document.body.scrollTop >= document.body.scrollHeight - 1500) {
    listPhotos();
  }
  for (let i = 0; i < all_containers.length; i++) {
    for (let j = 0; j < all_containers[i].length; j++) {
      const container = all_containers[i][j];
      if (isScrolledIntoView(container.element)) {
        loadContainer(container);
      } else {
        unloadContainer(container);
      }
    }
  }
};
function detectswipe(el, func) {
  swipe_det = new Object();
  swipe_det.sX = 0;
  swipe_det.sY = 0;
  swipe_det.eX = 0;
  swipe_det.eY = 0;
  var min_x = 30;
  var max_x = 30;
  var min_y = 50;
  var max_y = 60;
  var direc = "";
  ele = document.getElementById(el);
  ele.addEventListener(
    "touchstart",
    function (e) {
      var t = e.touches[0];
      swipe_det.sX = t.screenX;
      swipe_det.sY = t.screenY;
    },
    false
  );
  ele.addEventListener(
    "touchmove",
    function (e) {
      e.preventDefault();
      var t = e.touches[0];
      swipe_det.eX = t.screenX;
      swipe_det.eY = t.screenY;
    },
    false
  );
  ele.addEventListener(
    "touchend",
    function (e) {
      if (
        (swipe_det.eX - min_x > swipe_det.sX ||
          swipe_det.eX + min_x < swipe_det.sX) &&
        swipe_det.eY < swipe_det.sY + max_y &&
        swipe_det.sY > swipe_det.eY - max_y &&
        swipe_det.eX > 0
      ) {
        if (swipe_det.eX > swipe_det.sX) direc = "r";
        else direc = "l";
      } else if (
        (swipe_det.eY - min_y > swipe_det.sY ||
          swipe_det.eY + min_y < swipe_det.sY) &&
        swipe_det.eX < swipe_det.sX + max_x &&
        swipe_det.sX > swipe_det.eX - max_x &&
        swipe_det.eY > 0
      ) {
        if (swipe_det.eY > swipe_det.sY) direc = "d";
        else direc = "u";
      }

      if (direc != "") {
        if (typeof func == "function") func(el, direc);
      }
      direc = "";
      swipe_det.sX = 0;
      swipe_det.sY = 0;
      swipe_det.eX = 0;
      swipe_det.eY = 0;
    },
    false
  );
}

window.addEventListener("load", function () {
  console.log("Initializing swipe");
  detectswipe("photo_overlay", function (el, d) {
    if (d == "r") {
      setPhoto(getMediaItem(currentMediaItem, false));
    } else if (d == "l") {
      setPhoto(getMediaItem(currentMediaItem, true));
    }
  });
});

gapi.load("client", initClient);
