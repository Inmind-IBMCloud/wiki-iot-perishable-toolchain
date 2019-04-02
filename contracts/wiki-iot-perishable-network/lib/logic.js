/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Change namespace's name
 *
 */

'use strict';

/**
 * A shipment has been received by an importer
 * @param {org.acme.shipping.wiki_perishable.ShipmentReceived} shipmentReceived - the ShipmentReceived transaction
 * @transaction
 */
async function receiveShipment(shipmentReceived) {  // eslint-disable-line no-unused-vars

    const contract = shipmentReceived.shipment.contract;
    const shipment = shipmentReceived.shipment;
    let payOut = contract.unitPrice * shipment.unitCount;

    console.log('Received at: ' + shipmentReceived.timestamp);
    console.log('Contract arrivalDateTime: ' + contract.arrivalDateTime);

    // set the status of the shipment
    shipment.status = 'ARRIVED';

    // if the shipment did not arrive on time the payout is zero
    if (shipmentReceived.timestamp > contract.arrivalDateTime) {
        payOut = 0;
        console.log('Late shipment');
    } else {
        // find the lowest temperature reading
        if (shipment.temperatureReadings) {
            // sort the temperatureReadings by celsius
            shipment.temperatureReadings.sort(function (a, b) {
                return (a.celsius - b.celsius);
            });
            const lowestReading = shipment.temperatureReadings[0];
            const highestReading = shipment.temperatureReadings[shipment.temperatureReadings.length - 1];
            let penalty = 0;
            console.log('Lowest temp reading: ' + lowestReading.celsius);
            console.log('Highest temp reading: ' + highestReading.celsius);

            // does the lowest temperature violate the contract?
            if (lowestReading.celsius < contract.minTemperature) {
                penalty += (contract.minTemperature - lowestReading.celsius) * contract.minPenaltyFactor;
                console.log('Min temp penalty: ' + penalty);
            }

            // does the highest temperature violate the contract?
            if (highestReading.celsius > contract.maxTemperature) {
                penalty += (highestReading.celsius - contract.maxTemperature) * contract.maxPenaltyFactor;
                console.log('Max temp penalty: ' + penalty);
            }

            // apply any penalities
            payOut -= (penalty * shipment.unitCount);

            if (payOut < 0) {
                payOut = 0;
            }
        }
    }

    console.log('Payout: ' + payOut);
    contract.grower.accountBalance += payOut;
    contract.importer.accountBalance -= payOut;

    console.log('Grower: ' + contract.grower.$identifier + ' new balance: ' + contract.grower.accountBalance);
    console.log('Importer: ' + contract.importer.$identifier + ' new balance: ' + contract.importer.accountBalance);

    var NS = 'org.acme.shipping.wiki_perishable';
    // Store the ShipmentReceived transaction with the Shipment asset it belongs to
    shipment.shipmentReceived = shipmentReceived;

    var factory = getFactory();
    var shipmentReceivedEvent = factory.newEvent(NS, 'ShipmentReceivedEvent');
    var message = 'Shipment ' + shipment.$identifier + ' received';
    console.log(message);
    shipmentReceivedEvent.message = message;
    shipmentReceivedEvent.shipment = shipment;
    emit(shipmentReceivedEvent);

    // update the grower's balance
    const growerRegistry = await getParticipantRegistry('org.acme.shipping.wiki_perishable.Grower');
    await growerRegistry.update(contract.grower);

    // update the importer's balance
    const importerRegistry = await getParticipantRegistry('org.acme.shipping.wiki_perishable.Importer');
    await importerRegistry.update(contract.importer);

    // update the state of the shipment
    const shipmentRegistry = await getAssetRegistry('org.acme.shipping.wiki_perishable.Shipment');
    await shipmentRegistry.update(shipment);
}

/**
 * A temperature reading has been received for a shipment
 * @param {org.acme.shipping.wiki_perishable.TemperatureReading} temperatureReading - the TemperatureReading transaction
 * @transaction
 */
async function temperatureReading(temperatureReading) {

    var shipment = temperatureReading.shipment;
    var NS = 'org.acme.shipping.wiki_perishable';
    var contract = shipment.contract;
    var factory = getFactory();

    //console.log('Adding temperature ' + temperatureReading.celsius + ' to shipment ' + shipment.$identifier);

    if (shipment.temperatureReadings) {
        shipment.temperatureReadings.push(temperatureReading);
    } else {
        shipment.temperatureReadings = [temperatureReading];
    }

    if (temperatureReading.celsius < contract.minTemperature ||
        temperatureReading.celsius > contract.maxTemperature) {
        var temperatureEvent = factory.newEvent(NS, 'TemperatureThresholdEvent');
        temperatureEvent.shipment = shipment;
        temperatureEvent.temperature = temperatureReading.celsius;
        temperatureEvent.latitude = temperatureReading.latitude;
        temperatureEvent.longitude = temperatureReading.longitude;
        temperatureEvent.readingTime = temperatureReading.readingTime;
        temperatureEvent.message = 'Temperature threshold violated! Emitting TemperatureEvent for shipment: ' + shipment.$identifier;
        emit(temperatureEvent);
    }

    return getAssetRegistry(NS + '.Shipment')
        .then(function (shipmentRegistry) {
            // add the temp reading to the shipment
            return shipmentRegistry.update(shipment);
        });
}

/**
 * An Acceleration reading has been received for a shipment
 * @param {org.acme.shipping.wiki_perishable.AccelReading} AccelReading - the AccelReading transaction
 * @transaction
 */
async function AccelReading(AccelReading) {
    var shipment = AccelReading.shipment;
    var NS = 'org.acme.shipping.wiki_perishable';
    var contract = shipment.contract;
    var factory = getFactory();

    //console.log('Adding acceleration ' + AccelReading.accel_x + ' to shipment ' + shipment.$identifier);

    if (shipment.AccelReadings) {
        shipment.AccelReadings.push(AccelReading);
    } else {
        shipment.AccelReadings = [AccelReading];
    }

    // Also test for accel_y / accel_z
    if (AccelReading.accel_x < contract.maxAccel ) {
        var AccelerationEvent = factory.newEvent(NS, 'AccelerationThresholdEvent');
        AccelerationEvent.shipment = shipment;
        AccelerationEvent.accel_x = AccelReading.accel_x;
        AccelerationEvent.accel_y = AccelReading.accel_y;
        AccelerationEvent.accel_z = AccelReading.accel_z;
        AccelerationEvent.latitude = AccelReading.latitude;
        AccelerationEvent.longitude = AccelReading.longitude;
        AccelerationEvent.readingTime = AccelReading.readingTime;
        AccelerationEvent.message = 'Acceleration threshold violated! Emitting AccelerationEvent for shipment: ' + shipment.$identifier;
        emit(AccelerationEvent);
    }

    return getAssetRegistry(NS + '.Shipment')
        .then(function (shipmentRegistry) {
            // add the temp reading to the shipment
            return shipmentRegistry.update(shipment);
        });
}

/**
 * A GPS reading has been received for a shipment
 * @param {org.acme.shipping.wiki_perishable.GpsReading} gpsReading - the GpsReading transaction
 * @transaction
 */
async function gpsReading(gpsReading) {

    var factory = getFactory();
    var NS = 'org.acme.shipping.wiki_perishable';
    var shipment = gpsReading.shipment;
    var PORT_OF_NEW_YORK = '/LAT:40.6840N/LONG:74.0062W';

    if (shipment.gpsReadings) {
        shipment.gpsReadings.push(gpsReading);
    } else {
        shipment.gpsReadings = [gpsReading];
    }

    var latLong = '/LAT:' + gpsReading.latitude + gpsReading.latitudeDir + '/LONG:' +
    gpsReading.longitude + gpsReading.longitudeDir;

    if (latLong === PORT_OF_NEW_YORK) {
        var shipmentInPortEvent = factory.newEvent(NS, 'ShipmentInPortEvent');
        shipmentInPortEvent.shipment = shipment;
        var message = 'Shipment has reached the destination port of ' + PORT_OF_NEW_YORK;
        shipmentInPortEvent.message = message;
        emit(shipmentInPortEvent);
    }

    return getAssetRegistry(NS + '.Shipment')
        .then(function (shipmentRegistry) {
            // add the temp reading to the shipment
            return shipmentRegistry.update(shipment);
        });
}

/**
 * ShipmentPacked transaction - invoked when the Shipment is packed and ready for pickup.
 *
 * @param {org.acme.shipping.wiki_perishable.ShipmentPacked} shipmentPacked - the ShipmentPacked transaction
 * @transaction
 */
async function packShipment(shipmentPacked) {  // eslint-disable-line no-unused-vars
    var shipment = shipmentPacked.shipment;
    var NS = 'org.acme.shipping.wiki_perishable';
    var factory = getFactory();

    // Add the ShipmentPacked transaction to the ledger (via the Shipment asset)
    shipment.shipmentPacked = shipmentPacked;

    // Create the message
    var message = 'Shipment packed for shipment ' + shipment.$identifier;

    // Log it to the JavaScript console
    //console.log(message);

    // Emit a notification telling subscribed listeners that the shipment has been packed
    var shipmentPackedEvent = factory.newEvent(NS, 'ShipmentPackedEvent');
    shipmentPackedEvent.shipment = shipment;
    shipmentPackedEvent.message = message;
    emit(shipmentPackedEvent);

    // Update the Asset Registry
    const shipmentRegistry = await getAssetRegistry(NS + '.Shipment');
    await shipmentRegistry.update(shipment);
}

/**
 * ShipmentPickup - invoked when the Shipment has been picked up from the packer.
 *
 * @param {org.acme.shipping.wiki_perishable.ShipmentPickup} shipmentPickup - the ShipmentPickup transaction
 * @transaction
 */
async function pickupShipment(shipmentPickup) {  // eslint-disable-line no-unused-vars
    var shipment = shipmentPickup.shipment;
    var NS = 'org.acme.shipping.wiki_perishable';
    var factory = getFactory();

    // Add the ShipmentPacked transaction to the ledger (via the Shipment asset)
    shipment.shipmentPickup = shipmentPickup;

    // Create the message
    var message = 'Shipment picked up for shipment ' + shipment.$identifier;

    // Log it to the JavaScript console
    //console.log(message);

    // Emit a notification telling subscribed listeners that the shipment has been packed
    var shipmentPickupEvent = factory.newEvent(NS, 'ShipmentPickupEvent');
    shipmentPickupEvent.shipment = shipment;
    shipmentPickupEvent.message = message;
    emit(shipmentPickupEvent);

    // Update the Asset Registry
    const shipmentRegistry = await getAssetRegistry(NS + '.Shipment');
    await shipmentRegistry.update(shipment);
}

/**
 * ShipmentLoaded - invoked when the Shipment has been loaded onto the container ship.
 *
 * @param {org.acme.shipping.wiki_perishable.ShipmentLoaded} shipmentLoaded - the ShipmentLoaded transaction
 * @transaction
 */
async function loadShipment(shipmentLoaded) { // eslint-disable-line no-unused-vars
    var shipment = shipmentLoaded.shipment;
    var NS = 'org.acme.shipping.wiki_perishable';
    var factory = getFactory();

    // Add the ShipmentPacked transaction to the ledger (via the Shipment asset)
    shipment.shipmentLoaded = shipmentLoaded;

    // Create the message
    var message = 'Shipment loaded for shipment ' + shipment.$identifier;

    // Log it to the JavaScript console
    //console.log(message);

    // Emit a notification telling subscribed listeners that the shipment has been packed
    var shipmentLoadedEvent = factory.newEvent(NS, 'ShipmentLoadedEvent');
    shipmentLoadedEvent.shipment = shipment;
    shipmentLoadedEvent.message = message;
    emit(shipmentLoadedEvent);

    // Update the Asset Registry
    const shipmentRegistry = await getAssetRegistry(NS + '.Shipment');
    await shipmentRegistry.update(shipment);
}

/**
 * Initialize some test assets and participants useful for running a demo.
 * @param {org.acme.shipping.wiki_perishable.SetupDemo} setupDemo - the SetupDemo transaction
 * @transaction
 */
async function setupDemo(setupDemo) {

    var factory = getFactory();
    var NS = 'org.acme.shipping.wiki_perishable';

    // create the grower
    var grower = factory.newResource(NS, 'Grower', 'farmer@email.com');
    var growerAddress = factory.newConcept(NS, 'Address');
    growerAddress.country = 'USA';
    grower.address = growerAddress;
    grower.accountBalance = 0;

    // create the importer
    var importer = factory.newResource(NS, 'Importer', 'supermarket@email.com');
    var importerAddress = factory.newConcept(NS, 'Address');
    importerAddress.country = 'UK';
    importer.address = importerAddress;
    importer.accountBalance = 0;

    // create the shipper
    var shipper = factory.newResource(NS, 'Shipper', 'shipper@email.com');
    var shipperAddress = factory.newConcept(NS, 'Address');
    shipperAddress.country = 'Panama';
    shipper.address = shipperAddress;
    shipper.accountBalance = 0;

    // create the contract
    var contract = factory.newResource(NS, 'Contract', 'CON_002');
    contract.grower = factory.newRelationship(NS, 'Grower', 'farmer@email.com');
    contract.importer = factory.newRelationship(NS, 'Importer', 'supermarket@email.com');
    contract.shipper = factory.newRelationship(NS, 'Shipper', 'shipper@email.com');
    var tomorrow = setupDemo.timestamp;
    tomorrow.setDate(tomorrow.getDate() + 1);
    contract.arrivalDateTime = tomorrow; // the shipment has to arrive tomorrow
    contract.unitPrice = 0.5; // pay 50 cents per unit
    contract.minTemperature = 2; // min temperature for the cargo
    contract.maxTemperature = 10; // max temperature for the cargo
    contract.maxAccel = 15000; // max acceleration for the cargo
    contract.minPenaltyFactor = 0.2; // we reduce the price by 20 cents for every degree below the min temp
    contract.maxPenaltyFactor = 0.1; // we reduce the price by 10 cents for every degree above the max temp

    // create the shipment
    var shipment = factory.newResource(NS, 'Shipment', 'SHIP_001');
    shipment.type = 'MEDICINE';
    shipment.status = 'IN_TRANSIT';
    shipment.unitCount = 5000;
    shipment.contract = factory.newRelationship(NS, 'Contract', 'CON_002');

    // create the Temperature sensor
    var temperatureSensor = factory.newResource(NS, 'TemperatureSensor', 'SENSOR_TEMP001');

    // create the GPS sensor
    var gpsSensor = factory.newResource(NS, 'GpsSensor', 'SENSOR_GPS001');

    // add the growers
    const growerRegistry = await getParticipantRegistry(NS + '.Grower');
    await growerRegistry.addAll([grower]);

    // add the importers
    const importerRegistry = await getParticipantRegistry(NS + '.Importer');
    await importerRegistry.addAll([importer]);

    // add the shippers
    const shipperRegistry = await getParticipantRegistry(NS + '.Shipper');
    await shipperRegistry.addAll([shipper]);

    // add the temperature sensor
    const temperatureSensorRegistry = await getParticipantRegistry(NS + '.TemperatureSensor');
    await temperatureSensorRegistry.addAll([temperatureSensor]);

    // add the GPS sensor
    const gpsSensorRegistry = await getParticipantRegistry(NS + '.GpsSensor');
    await gpsSensorRegistry.addAll([gpsSensor]);

    // add the contracts
    const contractRegistry = await getAssetRegistry(NS + '.Contract');
    await contractRegistry.addAll([contract]);

    // add the shipments
    const shipmentRegistry = await getAssetRegistry(NS + '.Shipment');
    await shipmentRegistry.addAll([shipment]);

    /* DEBUT OLD CODE

    return getParticipantRegistry(NS + '.Grower')
        .then(function (growerRegistry) {
            // add the growers
            return growerRegistry.addAll([grower]);
        })
        .then(function() {
            return getParticipantRegistry(NS + '.Importer');
        })
        .then(function(importerRegistry) {
            // add the importers
            return importerRegistry.addAll([importer]);
        })
        .then(function() {
            return getParticipantRegistry(NS + '.Shipper');
        })
        .then(function(shipperRegistry) {
            // add the shippers
            return shipperRegistry.addAll([shipper]);
        })
        .then(function() {
            return getAssetRegistry(NS + '.Contract');
        })
        .then(function(contractRegistry) {
            // add the contracts
            return contractRegistry.addAll([contract]);
        })
        .then(function() {
            return getAssetRegistry(NS + '.Shipment');
        })
        .then(function(shipmentRegistry) {
            // add the shipments
            return shipmentRegistry.addAll([shipment]);
        });

FIN OLD CODE */

}
