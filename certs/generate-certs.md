# How to generate certs


Using the GitBash terminal:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 -keyout server.key -out server.cert
```

My answers:

```text
Country Name (2 letter code) [AU]:BR
State or Province Name (full name) [Some-State]:São Paulo
Locality Name (eg, city) []:São Paulo
Organization Name (eg, company) [Internet Widgits Pty Ltd]:Potentii
Organizational Unit Name (eg, section) []:GoonerLab
Common Name (e.g. server FQDN or YOUR name) []:localhost
Email Address []:potentii@gmail.com
```



