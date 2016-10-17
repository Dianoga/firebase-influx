import path from 'path';
import influx from 'influx';
import _ from 'lodash';

const firebase = require('firebase');

const paths = {
	configDir: path.resolve(__dirname, '../', 'config/')
};

const config = require(`${paths.configDir}/config`);

class Manager {
	constructor() {
		firebase.initializeApp({
			databaseURL: 'https://project-2731511947915132034.firebaseio.com/',
			serviceAccount: `${paths.configDir}/firebase-account.json`
		});

		this.firebase = firebase.database();
		this.influx = influx(config.influx);
	}

	init() {
		this.firebase.ref('/devices')
			.on('value', this.handleDevices.bind(this));

		this.firebase.ref('/power')
			.on('value', this.handlePower.bind(this));
	}

	handleDevices(snapshot) {
		const data = snapshot.val();
		const tagKeys = ['name', 'id', 'type'];
		const time = new Date();

		_.each(data, val => {
			const tags = {};
			const fields = { time: time };

			_.each(val, (attr, key) => {
				const test = Number.parseFloat(attr);

				if (tagKeys.indexOf(key) === -1) {
					fields[key] = isNaN(test) ? attr : test.valueOf();
				} else {
					tags[key] = isNaN(test) ? attr : test.valueOf();
				}
			});

			this.influx.writePoint('devices', fields, tags, err => {
				if (err) console.error(err);
			});
		});
	}

	handlePower(snapshot) {
		const data = snapshot.val();
		const time = new Date();

		_.each(data, val => {
			const tags = {
				id: val.id,
				name: val.name
			};

			const fields = {
				time: time,
				watts: Number.parseFloat(val.watts)
			};

			this.influx.writePoint('power', fields, tags, err => {
				if (err) console.error(err);
			});
		});
	}
}

const manager = new Manager();
manager.init();
