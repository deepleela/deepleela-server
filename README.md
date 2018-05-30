<p align="center">
<img src="https://wpoffice365.com/wp-content/uploads/2017/07/react-logo.png" height="75" />
<img src="https://www.vectorlogo.zone/logos/js_webpack/js_webpack-card.png" height="75" />
<img src="https://cdn-images-1.medium.com/max/960/1*pxfq-ikL8zPE3RyGB2xbng.png" height="75" />
</p>

DeepLeela-Server
===

DeepLeela Node.js Server

## Prerequisites

1. Node.js 8.9+

2. NPM 5.6+

# Building 

```
git clone https://github.com/deepleela/deepleela-server.git
cd deepleela-server
npm install 
npm run build
```

# Running

```
node build/main/index.js
```

Port 3301: DeepLeela Winrate/Heatmap/GTP/etc 

Port 3302: CGOS on DeepLeela

Port 3303: DeepLeela Online Review

The default configruation file is config.json, you should copy `config.json.example` to `config.json` manually.

# Nginx Reverse Proxy Examples

To enable the TCP communication between webpage and server,  you should config nginx reverse proxies. Here are examples.

```
nano /etc/nginx/conf.d/deepleela-gtp.conf

upstream deepleela_gtp {
    server localhost:3301;
}

server {
   server_name  w.deepleela.com;

  location / {
        proxy_pass http://deepleela_gtp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
  }
}
```

```
nano /etc/nginx/conf.d/deepleela-cgos.conf

upstream deepleela_cgos {
    server localhost:3302;
}

server {
   server_name  cgos.deepleela.com;

  location / {
        proxy_pass http://deepleela_cgos;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
  }
}
```


```
nano /etc/nginx/conf.d/deepleela-review.conf

upstream deepleela_review {
    server localhost:3303;
}

server {
   server_name  review.deepleela.com;

  location / {
        proxy_pass http://deepleela_review;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
  }
}
```

We recommend installing certbot to enable TLS. More info: https://certbot.eff.org/

# License

GPL-3.0