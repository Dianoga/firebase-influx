const path = require('path');
const Influx = require('influx');
const firebase = require('firebase-admin');

const paths = {
	configDir: path.resolve(__dirname, '../', 'config/')
};

const config = require(`${paths.configDir}/config`);
const serviceAccount = require(`${paths.configDir}/firebase-account.json`);

class Manager {
	constructor() {
		firebase.initializeApp({
			databaseURL: config.firebaseUrl,
			credential: firebase.credential.cert(serviceAccount)
		});

		this.firebase = firebase.database();
		this.influx = new Influx.InfluxDB(config.influx);

		this.handlePower = this.handlePower.bind(this);
		this.handleDevice = this.handleDevice.bind(this);
		this.handleDevices = this.handleDevices.bind(this);
		this.listenToDevice = this.listenToDevice.bind(this);
	}

	init() {
		// Data from Curb
		this.firebase.ref('/power').on('value', this.handlePower);

		const deviceRef = this.firebase.ref('/devices');
		deviceRef.once('value').then(snapshot => {
			const data = snapshot.val();
			Object.keys(data).forEach(this.listenToDevice);
		});

		deviceRef.on('child_added', this.handleDevice);
	}

	listenToDevice(id) {
		this.firebase
			.ref(`/devices/${id}`)
			.on('value', snapshot => this.handleDevice(snapshot.val()));
	}

	handleDevices(snapshot) {
		const data = snapshot.val();
		Object.values(data).forEach(this.handleDevice);
	}

	handleDevice(device) {
		const tagKeys = ['name', 'id', 'type'];
		const tags = {};
		const fields = {};

		Object.keys(device).forEach(key => {
			const attr = device[key];
			const test = Number.parseFloat(attr);

			if (tagKeys.indexOf(key) === -1) {
				fields[key] = isNaN(test) ? attr.toString() : test.valueOf();
			} else {
				tags[key] = key === 'type' ? attr.toString() : attr;
			}
		});

		if (Object.keys(fields).length === 0) {
			// Nothing to send
			return;
		}

		this.influx.writeMeasurement('devices', [{ fields, tags }]).catch(err => {
			console.error(err, fields, tags);
		});
	}

	handlePower(snapshot) {
		const data = snapshot.val();
		// const time = new Date();

		const tags = {};
		const fields = {};

		const circuitTypes = {};
		Object.values(data).forEach(val => {
			let key;
			if (val.label) {
				key = val.label;
			} else {
				if (!circuitTypes[val.circuit_type]) circuitTypes[val.circuit_type] = 0;
				key = `${val.circuit_type}-${circuitTypes[val.circuit_type]}`;
				circuitTypes[val.circuit_type]++;
			}
			fields[key] = Number.parseFloat(val.w);
		});

		this.influx.writeMeasurement('power', [{ fields, tags }]).catch(err => {
			if (err) console.error(err);
		});
	}

	nameToField(name) {
		return name.replace(/ /g, '\\ ').replace(/,/g, '\\,');
	}
}

const manager = new Manager();
manager.init();
