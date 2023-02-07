### Acme Bank
Welcome to Acme Bank! Acme Bank is a small credit union that provides assistance with deposits, loans, and a wide array of other financial services.

While the skeleton of their web app has been completed, there are certain vulnerabilities that were overlooked.

In this off-platform project, you will secure the application by:

Protecting it against Cross-Site Scripting (XSS) Attacks by using helmet, securing cookies, validating and normalizing data with express-validator, and implementing alternative methods to prevent DOM-Based XSS attacks.
Preventing SQL injection attacks by using prepared statements as well as validating input.
Preventing Cross-Site Request Forgery (CSRF) attacks by implementing csurf middleware and updating certain view pages to secure any cross-site request vulnerabilities.