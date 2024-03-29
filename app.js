'use strict';

const sqlite3 = require('sqlite3');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const { body, query, validationResult, oneOf } = require('express-validator');
const csrfToken = require('csrf');
const tokens = new csrfToken();

const db = new sqlite3.Database('./bank_sample.db');

const app = express();
const PORT = 3000;
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.use(helmet());
app.use(
	session({
		secret: 'secret',
		resave: true,
		saveUninitialized: false,
    cookie: {
			maxAge: 30000,
			secure: false, //true в реальной работе
			httpOnly: true,
		},
	})
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', function (request, response) {
	if(request.session.loggedin) {
		response.redirect('/home');
	} else {
		response.sendFile(path.join(__dirname + '/html/login.html'));
	}
});

//LOGIN SQL
app.post('/auth', function (request, response) {
	var username = request.body.username;
	var password = request.body.password;
	console.log(username);
	if (username && password) {
		db.get(
			'SELECT * FROM users WHERE username = $username AND password = $password',
			{
				$username: request.body.username,
				$password: request.body.password
			},
			function (error, results) {
				console.log(error);
				console.log(results);
				if (results) {
					request.session.loggedin = true;
					request.session.username = results['username'];
					request.session.balance = results['balance'];
					request.session.file_history = results['file_history'];
					request.session.account_no = results['account_no'];
					response.redirect('/home');
				} else {
					response.send('Incorrect Username and/or Password!');
				}
				response.end();
			}
		);
	} else {
		response.send('Please enter Username and Password!');
		response.end();
	}
});

//Home Menu No Exploits Here.
app.get('/home', function (request, response) {
	if (request.session.loggedin) {
		const username = request.session.username;
		const balance = request.session.balance;
		response.render('home_page', { username, balance });
	} else {
		response.redirect('/');
	}
	response.end();
});

//CSRF CODE SECURED. SEE HEADERS SET ABOVE
app.get('/transfer', function (request, response) {
	if (request.session.loggedin) {
		let secret = tokens.secretSync();
		const token = tokens.create(secret);
		request.session.csrfUSec = secret;
		var sent = '';
		response.render('transfer', { sent, token });
	} else {
		response.redirect('/');
	}
});

//CSRF CODE
//http://localhost:3000/transfer?account_to=10001&amount=1000
app.post('/transfer', [body('amount').toInt().isInt({min: 0}).trim().escape(), body('account_to').toInt().isInt({min: 0}).trim().escape()], function (request, response, next) {
	if (request.session.loggedin && request.session.csrfUSec && request.body._csrftoken) {
		if (!tokens.verify(request.session.csrfUSec, request.body._csrftoken)) return response.redirect('/');
		const token = tokens.create(request.session.csrfUSec);
		const errorValidation = validationResult(request);
		if(!errorValidation.isEmpty()) {
			let sent = 'Account id and amount must by numbers';
			return response.render('transfer', { sent, token });
		}
		console.log('Transfer in progress');
		var balance = request.session.balance;
		var account_to = parseInt(request.body.account_to);
		var amount = parseInt(request.body.amount);
		var account_from = request.session.account_no;
		if (account_to && amount) {
			if (balance > amount) {
				db.get(
					'UPDATE users SET balance = balance + ? WHERE account_no = ?', [amount, account_to],
					function (error, results) {
						if(error) {
							return next(error);
						}
						console.log(error);
						console.log(results);
						db.get(
							'UPDATE users SET balance = balance - ? WHERE account_no = ?',
							[amount, account_from],
							function (error, results) {
								let sent = 'Money Transfered';
								response.render('transfer', { sent, token });
							}
						);
					}
				);
			} else {
				let sent = 'You Don\'t Have Enough Funds.';
				response.render('transfer', { sent, token });
			}
		} else {
			let sent = '';
			response.render('transfer', { sent, token });
		}
	} else {
		response.redirect('/');
	}
});

//PATH TRAVERSAL CODE
app.get('/download', function (request, response) {
	if (request.session.loggedin) {
		console.log(request.session.file_history);
		let file_name = request.session.file_history;
		response.render('download', { file_name });
	} else {
		response.redirect('/');
	}
	response.end();
});

app.post('/download', function (request, response) {
	if (request.session.loggedin) {
		var file_name = request.body.file;

		response.statusCode = 200;
		response.setHeader('Content-Type', 'text/html');

		// Change the filePath to current working directory using the "path" method
		const rootDirectory = process.cwd();
		const filePath = path.join(rootDirectory,'/history_files/',file_name);
		const verify = filePath.includes('/history_files/' + request.session.file_history);
		//пользователь может изменить у себя значение которые отправляется на сервер и получить данные из другого файла.
		//что бы это предотвратить мы нормализируем путь и проверяем наличие в пути необходимой папки и называния файла который прендлежит пользователю
		//понятно что пример в учебных целях, в реальности не надо передавать на фрон вообще возможность указывать явно файл.
		try {
			if(!verify) {
				throw new Error('No such a directory');
			}
			const content = fs.readFileSync(filePath, 'utf8');
			response.end(content);
		} catch (err) {
			console.log(err);
			response.end('File not found');
		}
	} else {
		response.redirect('/');
	}
	response.end();
});

//XSS CODE
app.get('/public_forum', function (request, response) {
	if (request.session.loggedin) {
		db.all('SELECT username,message FROM public_forum', (err, rows) => {
			console.log(rows);
			console.log(err);
			response.render('forum', { rows });
		});
	} else {
		response.redirect('/');
	}
	//response.end();
});

app.post('/public_forum', body('comment').trim().escape() ,function (request, response) {
	if (request.session.loggedin) {
		var comment = request.body.comment;
		var username = request.session.username;
		if (comment) {
			db.all(
				'INSERT INTO public_forum (username,message) VALUES (?, ?)', 
				[username ,comment],
				(err, rows) => {
					console.log(err);
				}
			);
			db.all('SELECT username,message FROM public_forum', (err, rows) => {
				console.log(rows);
				console.log(err);
				response.render('forum', { rows });
			});
		} else {
			db.all('SELECT username,message FROM public_forum', (err, rows) => {
				console.log(rows);
				console.log(err);
				response.render('forum', { rows });
			});
		}
		comment = '';
	} else {
		response.redirect('/');
	}
	comment = '';
	//response.end();
});

//SQL UNION INJECTION
app.get('/public_ledger', oneOf([query('id').isInt({min:0}).trim().escape(), query('id').isEmpty()]), function (request, response) {
	const errors = validationResult(request);
	if (request.session.loggedin) {
		if(!errors.isEmpty()) {
			return response.redirect('/public_ledger');
		}
		var id = request.query.id;
		if (id) {
			db.all(
				'SELECT * FROM public_ledger WHERE from_account = ?', [id],
				(err, rows) => {
					console.log('PROCESSING INPU');
					console.log(err);
					if (rows) {
						response.render('ledger', { rows });
					} else {
						response.render('ledger', { rows });
					}
				}
			);
		} else {
			db.all('SELECT * FROM public_ledger', (err, rows) => {
				if (rows) {
					response.render('ledger', { rows });
				} else {
					response.render('ledger', { rows });
				}
			});
		}
	} else {
		response.redirect('/');
	}
	//response.end();
});

app.post('/logout', (request, response) => {
	request.session.destroy(()=>{
		response.redirect('/');
	});
});

app.listen(PORT, (request, response) => {
	console.log(`Server is running on port: ${PORT}`);
});
