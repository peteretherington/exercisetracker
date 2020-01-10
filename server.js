require('dotenv').config();
const cors = require('cors');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();

const mongoose = require('mongoose');
mongoose.connect(process.env.MLAB_URI, { useNewUrlParser: true, useUnifiedTopology: true }, () =>
	console.log(mongoose.connection.readyState)
);

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static('public'));
app.get('/', (req, res) => {
	res.sendFile(__dirname + '/views/index.html');
});

// Schema
const Schema = mongoose.Schema;

const UserSchema = new Schema({
	username: String,
	exercises: [
		{
			description: String,
			duration: Number,
			date: Date
		}
	]
});

// Model
const UserModel = mongoose.model('User', UserSchema);

// I can create a user by posting form data username to /api/exercise/new-user and returned
// will be an object with username and _id.
app.post('/api/exercise/new-user', (req, res) => {
	const { username } = req.body;
	const User = new UserModel({ username });

	UserModel.findOne({ username }, (err, user) => {
		if (err) res.json(err);
		if (user) res.json({ message: `User <${user.username}> already exists.` });
		if (!user) {
			User.save((err, { _id, username }) => (err ? res.json(err) : res.json({ _id, username })));
		}
	});
});

// I can get an array of all users by getting api/exercise/users with the same info as
// when creating a user.
app.get('/api/exercise/users', (req, res) => {
	UserModel.find({}, (err, users) => {
		if (err) res.json(err);
		res.json({
			users: users.reduce((acc, { _id, username }) => [...acc, { _id, username }], [])
		});
	});
});

// I can add an exercise to any user by posting form data userId(_id), description, duration,
// and optionally date to /api/exercise/add. If no date supplied it will use current date.
// App will return the user object with the exercise fields added.
app.post('/api/exercise/add', (req, res) => {
	const { userId, description, duration, date } = req.body;
	const options = { new: true };
	UserModel.findByIdAndUpdate(
		userId,
		{ $push: { exercises: { description, duration, date: date || new Date() } } },
		options,
		(err, user) => (err ? res.json(err) : res.json(user))
	);
});

// 1) I can retrieve a full exercise log of any user by getting /api/exercise/log with a
// parameter of userId(_id). App will return the user object with added array log and count
// (total exercise count).
// 2) I can retrieve part of the log of any user by also passing along optional parameters
// of from & to or limit. (Date format yyyy-mm-dd, limit = int)
app.get('/api/exercise/log', (req, res) => {
	const { userId, from, to, limit } = req.query;
	if (!userId) {
		res.json({
			error:
				"Must include a user ID in the query string. Example: '/api/exercise/log?userId={userId}'"
		});
	} else if (!from && !to && !limit) {
		UserModel.findById(userId, (err, user) => (err ? res.json(err) : res.json(user)));
	} else {
		UserModel.findById(userId, (err, user) => {
			if (err) res.json(err);
			// retrieve part of the log
			const { username, exercises } = user;
			const filteredExercises = exercises.filter(i => {
				const exerciseDate = new Date(i.date).getTime();
				let fromDate, toDate;
				if (from && to) {
					fromDate = new Date(from).getTime();
					toDate = new Date(to).getTime();
					if (exerciseDate > fromDate && exerciseDate < toDate) return i;
				} else if (from) {
					fromDate = new Date(from).getTime();
					if (exerciseDate > fromDate) return i;
				} else if (to) {
					toDate = new Date(to).getTime();
					if (exerciseDate < toDate) return i;
				} else {
					return i;
				}
			});
			const limitedExercises = filteredExercises.slice(0, limit || filteredExercises.length);
			res.json({ username, exercises: limitedExercises });
		});
	}
});

// Not found middleware
app.use((req, res, next) => {
	return next({ status: 404, message: 'not found' });
});

// Error Handling middleware
app.use((err, req, res, next) => {
	let errCode, errMessage;

	if (err.errors) {
		// mongoose validation error
		errCode = 400; // bad request
		const keys = Object.keys(err.errors);
		// report the first validation error
		errMessage = err.errors[keys[0]].message;
	} else {
		// generic or custom error
		errCode = err.status || 500;
		errMessage = err.message || 'Internal Server Error';
	}
	res
		.status(errCode)
		.type('txt')
		.send(errMessage);
});

const listener = app.listen(process.env.PORT, () => {
	console.log('Your app is listening on port ' + listener.address().port);
});
