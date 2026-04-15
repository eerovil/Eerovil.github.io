// Google Photos Library API + Google Identity Services (OAuth 2.0 token model).
// Replaces deprecated gapi.auth2 / Google Sign-In for Web.
var CLIENT_ID =
  "734651298434-6lukaeulk76bjmj4pkv456lt1bbd1f8v.apps.googleusercontent.com";
var SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly";
var tokenClient;

function initClient() {
  // Do not load discoveryDocs: fetching the Photos Library discovery document
  // fails with HTTP 400 from current gapi (bad pp/fields query). All requests
  // below use full REST paths, so discovery is unnecessary.
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

      setSigninStatus();
    })
    .catch(function (err) {
      console.error("gapi.client.init failed", err);
    });
}

function handleAuthClick() {
  var token = gapi.client.getToken();
  if (token && token.access_token) {
    gapi.client.setToken("");
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
    $("#auth-status").html("");
    listAlbums();
  } else {
    $("#sign-in-or-out-button").css("display", "inline-block");
    $("#sign-in-or-out-button").html("Sign In/Authorize");
    $("#revoke-access-button").css("display", "none");
    $("#auth-status").html(
      "You have not authorized this app or you are signed out."
    );
  }
}

var currentMediaItem = null;

function setPhoto(mediaItem) {
    const photo_big = document.getElementById('photo_big');
    const photo_overlay = document.getElementById('photo_overlay');
    if (mediaItem == null) {
        if (!get_prevent_taps()) {
            return;
        }
        currentMediaItem = mediaItem;
        photo_big.removeChild(photo_big.firstChild);
        photo_big.classList.add('hidden')
        photo_overlay.classList.add('hidden')
        return;
    }
    currentMediaItem = mediaItem;
    photo_big.classList.remove('hidden')
    photo_overlay.classList.remove('hidden')
    let el;
    if (mediaItem.mimeType.indexOf('image/') === 0) {
        const url = buildFullUrl(mediaItem);
        el = document.createElement('img');
        el.src = url;
    } else if (mediaItem.mimeType.indexOf('video/') === 0) {
        const url = mediaItem.baseUrl + "=dv";
        el = document.createElement('video');
        el.autoplay = true;
        el.controls = "true";
        el.loop = "true"
        el.height = window.innerHeight;
        el.width = window.innerWidth;
        el.src = url;
        el.addEventListener('loadstart', function (event) {
            photo_big.classList.add('loading');
            photo_big.poster = '';
        });
        el.addEventListener('canplay', function (event) {
            photo_big.classList.remove('loading');
            photo_big.poster = '';
        });
    } else {
        return;
    }
    el.id = mediaItem.id;
    if (photo_big.firstChild) {
        photo_big.replaceChild(el, photo_big.firstChild);
    } else {
        photo_big.appendChild(el);
    }
    // console.log(img.offsetWidth);
    // img.style['margin-left'] = `-${img.offsetWidth / 2}px`;
}

function getMediaItem(mediaItem, next) {
    let prev = null;
    let return_next = false;
    for (let i=0; i<all_containers.length; i++) {
        for (let j=0; j<all_containers[i].length; j++) {
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

function preloadMediaItem(mediaItem) {
    if (mediaItem.mimeType.indexOf('image/') === 0) {
        (new Image()).src = buildFullUrl(mediaItem);
    } else if (mediaItem.mimeType.indexOf('video/') === 0) {
        return;
    }
}

function buildFullUrl(mediaItem) {
    return mediaItem.baseUrl + "=w2048-h1024";
}
function thumbnail(mediaItem) {
    return mediaItem.baseUrl;
}
var nextPageToken = null; 
var listing = true;
var albumId = null;
function listAlbums() {
    let request = gapi.client.request({
        'method': 'GET',
        'path': 'https://photoslibrary.googleapis.com/v1/albums',
        'params': {pageSize: 50}
    });
    request.execute(function(response) {
        console.log(response)
        const container = document.getElementById('photos_list')
        let createAlbum = function(title, id) {
            let el = document.createElement('a');
            el.id = id
            el.innerHTML = title
            el.href = "#"
            el.onclick = function(event) {
                event.preventDefault();
                albumId = event.target.id !== "null" ? event.target.id : null
                container.innerHTML = ""
                while ((document.body.scrollTop) >= document.body.scrollHeight - 1500) {
                    listPhotos();
                }
                return false;
            }
            container.appendChild(el)
            container.appendChild(document.createElement('br'))
        }
        createAlbum("Kaikki kuvat", null);
        for (let i=0; i<response.albums.length; i++) {
            let album = response.albums[i];
            createAlbum(album.title, album.id);
        }
    });
}

class queueObj {
    constructor() {
        this.queue = [];
        this.running = false;
    }
    addToQueue(url) {
        this.queue.push(url);
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
        let img = item.el || new Image();
        img.src = item.url;
        const self = this;
        if(img.width){
            this.deQueue();
        }else{
            img.onload = function(){
                self.deQueue();
            }
        }
    }
    deQueue() {
        this.running = false;
        this.run();
    }
}
thumbnailQueue = new queueObj();
preloadlQueue = new queueObj();
requestQueue = new queueObj();
requestQueue.handleItem = function(item) {
    let request;
    if (albumId === null){
        request = gapi.client.request({
        'method': 'GET',
        'path': 'https://photoslibrary.googleapis.com/v1/mediaItems',
        'params': {pageToken: nextPageToken, pageSize: 100}
        });
    } else {
        request = gapi.client.request({
        'method': 'POST',
        'path': 'https://photoslibrary.googleapis.com/v1/mediaItems:search',
        'params': {pageToken: nextPageToken, pageSize: 100, albumId: albumId}
        });
    }
    const containers = item.containers;
    const self = this;
    request.execute(function(response) {
        let mediaItems = response.mediaItems;
        const photos_list = document.getElementById('photos_list');
        nextPageToken = response.nextPageToken || "stop";
        for (let i=0; i<mediaItems.length; i++) {
            let mediaItem = mediaItems[i];
            let el = document.createElement('a')
            el.href = "#"
            el.onclick = function(event) {
                if (!get_prevent_taps()) {
                    return;
                }

                event.preventDefault();
                setPhoto(mediaItem);
                return false;
            }
            const container = containers[i];
            container.mediaItem = mediaItem;
            container.element.appendChild(el);
            container.a = el;
            if (isScrolledIntoView(container.element)) {
                loadContainer(container)
            }
        }
        // for (let i=mediaItems.length; i<containers.length; i++) {
        //     console.log("WARNING: got too few items: " + containers.length);
        //     try {
        //         photos_list.removeChild(containers[i].element);
        //     } catch (e) {
        //         console.log(e)
        //     }
        // }
        // containers.splice(mediaItems.length, containers.length);
        console.log(response);
        self.deQueue();
    });
}

function loadContainer(container) {
    if (container.loaded || container.a == undefined) {
        return
    }
    console.log("loadcontainer " + container)
    const el = container.a;
    let img = document.createElement('IMG');
    thumbnailQueue.addToQueue({el: img, url: thumbnail(container.mediaItem)});
    el.appendChild(img);
    if (container.element == undefined) {
        container.element = document.createElement('div');
        console.log("WARNING: containers list is empty");
    }
    container.element.appendChild(el);
    container.img = img;
    container.loaded = true;
    //preloadlQueue.addToQueue({el: null, url: buildFullUrl(mediaItem)});
}
function unloadContainer(container) {
    if (!container.loaded) {
        return
    }
    console.log("unloadcontainer " + container)
    container.a.removeChild(container.img);
    container.loaded = false;
    
}

function isScrolledIntoView(el) {
    var rect = el.getBoundingClientRect();
    var elemTop = rect.top;
    var elemBottom = rect.bottom;

    // Only completely visible elements return true:
    var isVisible = (elemBottom >= 0) && (elemTop <= window.innerHeight);
    // Partially visible elements return true:
    //isVisible = elemTop < window.innerHeight && elemBottom >= 0;
    return isVisible;
}

var all_containers = [];

var prevent_taps = false;
function get_prevent_taps() {
    if (prevent_taps) {
        return false;
    }
    prevent_taps = true;
    setTimeout(function() {
        prevent_taps = false;
    }, 500);
    return true;
}

function listPhotos() {
    console.log("listPhotos called")
    const photos_list = document.getElementById('photos_list');
    // Example 2: Use gapi.client.request(args) function
    if (nextPageToken === "stop") {
        return;
    }
    let subcontainers = [];
    // Create the containers right away
    for (let i=0; i<100; i++) {
        let container = document.createElement('div');
        photos_list.appendChild(container);
        subcontainers.push({element: container});
    }
    all_containers.push(subcontainers);
    requestQueue.addToQueue({containers: subcontainers});
}

window.onscroll = function(ev) {
    if ((document.body.scrollTop) >= document.body.scrollHeight - 1500) {
        listPhotos();
    }
    for (let i=0; i<all_containers.length; i++) {
        for (let j=0; j<all_containers[i].length; j++) {
            const container = all_containers[i][j];
            if (isScrolledIntoView(container.element)) {
                loadContainer(container);
            } else {
                unloadContainer(container)
            }
        }
    }
};
function detectswipe(el,func) {
    swipe_det = new Object();
    swipe_det.sX = 0; swipe_det.sY = 0; swipe_det.eX = 0; swipe_det.eY = 0;
    var min_x = 30;  //min x swipe for horizontal swipe
    var max_x = 30;  //max x difference for vertical swipe
    var min_y = 50;  //min y swipe for vertical swipe
    var max_y = 60;  //max y difference for horizontal swipe
    var direc = "";
    ele = document.getElementById(el);
    ele.addEventListener('touchstart',function(e){
      var t = e.touches[0];
      swipe_det.sX = t.screenX; 
      swipe_det.sY = t.screenY;
    },false);
    ele.addEventListener('touchmove',function(e){
      e.preventDefault();
      var t = e.touches[0];
      swipe_det.eX = t.screenX; 
      swipe_det.eY = t.screenY;    
    },false);
    ele.addEventListener('touchend',function(e){
      //horizontal detection
      if ((((swipe_det.eX - min_x > swipe_det.sX) || (swipe_det.eX + min_x < swipe_det.sX)) && ((swipe_det.eY < swipe_det.sY + max_y) && (swipe_det.sY > swipe_det.eY - max_y) && (swipe_det.eX > 0)))) {
        if(swipe_det.eX > swipe_det.sX) direc = "r";
        else direc = "l";
      }
      //vertical detection
      else if ((((swipe_det.eY - min_y > swipe_det.sY) || (swipe_det.eY + min_y < swipe_det.sY)) && ((swipe_det.eX < swipe_det.sX + max_x) && (swipe_det.sX > swipe_det.eX - max_x) && (swipe_det.eY > 0)))) {
        if(swipe_det.eY > swipe_det.sY) direc = "d";
        else direc = "u";
      }
  
      if (direc != "") {
        if(typeof func == 'function') func(el,direc);
      }
      direc = "";
      swipe_det.sX = 0; swipe_det.sY = 0; swipe_det.eX = 0; swipe_det.eY = 0;
    },false);  
  }

window.addEventListener('load', function() {
    console.log("Initializing swipe")
    detectswipe('photo_overlay', function(el, d) {
        if (d == 'r') {
            setPhoto(getMediaItem(currentMediaItem, false))
        } else if (d == 'l') {
            setPhoto(getMediaItem(currentMediaItem, true))
        }
    })
})

gapi.load("client", initClient);