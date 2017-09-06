angular.module('bachmans-common')
    .factory('bachWiredOrders', bachWiredOrdersService);

function bachWiredOrdersService($q) {
    var service = {
        GetDeliveryFees: _getDeliveryFees,
        GetServiceFees: _getServiceFees,
        GetDestinations: _getDestinations,
        DetermineEithers: _determineEithers
    };

    function _getDeliveryFees(shipments){
        var charges = 0;
        _.each(shipments, function(shipment){
            if(shipment.FTDDeliveryFees && shipment.FTDDeliveryFees > 0){
                charges = add(charges, shipment.FTDDeliveryFees); 
            }

            if(shipment.TFEDeliveryFees && shipment.TFEDeliveryFees > 0){
                charges = add(charges, shipment.TFEDeliveryFees); 
            }
        });
        return charges;
    }

    function _getServiceFees(shipments){
        var charges = 0;
        _.each(shipments, function(shipment){
            if(shipment.FTDServiceFees && shipment.FTDServiceFees > 0){
                charges = add(charges, shipment.FTDServiceFees); 
            }

            if(shipment.TFEServiceFees && shipment.TFEServiceFees > 0){
                charges = add(charges, shipment.TFEServiceFees); 
            }
        });
        return charges;
    }

    function _determineEithers(shipment, buyerxp) {
        var lineitems = _getDestinations(shipment);
        var destinationGroup = _.groupBy(lineitems, function(li) {
            return li.xp.Destination;
        });

        //if there are any eithers (li.xp.Destination = 'E'), then run algorithm
        if (destinationGroup['E'] && destinationGroup['E'].length > 0) {

            var ftd = _.findWhere(buyerxp.wireOrder.OutgoingOrders, {
                Name: 'FTD.com'
            });
            var tfe = _.findWhere(buyerxp.wireOrder.OutgoingOrders, {
                Name: 'Teleflora.com'
            });
            ftd.type = 'F';
            tfe.type = 'T';

            var nonEDestinations = _.without(_.keys(destinationGroup), 'E');
            var destination;

            if (nonEDestinations.length === 0) {
                //this is a very volatile grouping since all line items are eithers
                //we want to keep previous grouping and only change it if absolutely necessary
                var previousGrouping = _.groupBy(shipment, function(li) {
                    return li.xp.Destination;
                });

                var hadFTDGrouping = typeof previousGrouping['F'] !== 'undefined';
                var hadTFEGrouping = typeof previousGrouping['T'] !== 'undefined';

                if (hadFTDGrouping && !hadTFEGrouping) {
                    return setDestination(shipment, 'F');

                } else if (!hadFTDGrouping && hadTFEGrouping) {
                    return setDestination(shipment, 'T');

                } else if (hadFTDGrouping && hadTFEGrouping) {
                    //if had both TFE and FTD previously, favor the majority
                    var FTDCount = previousGrouping['F'].length;
                    var TFECount = previousGrouping['T'].length;
                    if (FTDCount !== TFECount) {
                        //favor majority
                        return setDestination(shipment, FTDCount > TFECount ? 'F' : 'T');
                    } else {
                        //if equal then diceroll
                        destination = diceroll(ftd.OrderPercentage, tfe.OrderPercentage);
                        return setDestination(shipment, destination);
                    }
                } else {
                    //previous grouping hasn't changed, all still Eithers
                    destination = diceroll(ftd.OrderPercentage, tfe.OrderPercentage);
                    return setDestination(shipment, destination);
                }
            } else if (nonEDestinations.length === 1) {
                destination = nonEDestinations[0];
                return setDestination(shipment, destination);
            } else {
                var preferredDestination = ftd.OrderPercentage > tfe.OrderPercentage ? ftd : tfe;
                var otherDestination = preferredDestination.type === 'F' ? tfe : ftd;

                var eitherTotal = getLineTotalSum(destinationGroup['E']);
                var preferredTotal = getLineTotalSum(destinationGroup[preferredDestination.type]);
                var otherTotal = getLineTotalSum(destinationGroup[otherDestination.type]);

                if (eitherTotal + preferredTotal >= preferredDestination.MinOrderPrice.Price) {
                    return satisfyRequirements(destinationGroup['E'], preferredTotal, preferredDestination)
                        .then(function(remainingEithers) {
                            var remainingEithersTotal = getLineTotalSum(remainingEithers);
                            if (remainingEithersTotal + otherTotal >= otherDestination.MinOrderPrice.Price) {
                                return satisfyRequirements(remainingEithers, otherTotal, otherDestination)
                                    .then(function(lastEithers) {
                                        _.each(lastEithers, function(li) {
                                            destination = diceroll(ftd.OrderPercentage, tfe.OrderPercentage);
                                            return setDestination([li], destination);
                                        });
                                    });
                            } else {
                                destination = preferredDestination.type;
                                return setDestination(remainingEithers, destination);
                            }
                        });

                } else {
                    if (eitherTotal + otherTotal >= otherDestination.MinOrderPrice.Price) {
                        destination = otherDestination.type;
                        return setDestination(destinationGroup['E'], otherDestination.type);
                    } else {
                        destination = preferredDestination.type;
                        return setDestination(destinationGroup['E'], preferredDestination.type);
                    }
                }
            }
        }
    }


    function _getDestinations(lineitems) {
        lineitems = angular.copy(lineitems);
        _.each(lineitems, function(line) {
            var codeB4s = ['F', 'T', 'E'];
            if (codeB4s.indexOf(line.Product.xp['CodeB4']) > -1 && line.Product.xp['CodeB2'] === 'Y' && line.xp.DeliveryMethod !== 'LocalDelivery') {
                line.xp.deliveryCharges = 0;
                if (line.Product.xp['CodeB4'] === 'F') line.xp.Destination = 'FTD';
                if (line.Product.xp['CodeB4'] === 'T') line.xp.Destination = 'TFE';
                if (line.Product.xp['CodeB4'] === 'E') line.xp.Destination = 'E';
                line.xp.Status = 'OnHold'; // any wired orders must be put on hold
            } else if(line.xp.Destination){
                delete line.xp.Destination;
            }
        });
        return lineitems;
    }

    function diceroll(FTDPercentage, TelefloraPercentage) {
        var result;
        var diceroll = Math.random() * 100;
        if (FTDPercentage && TelefloraPercentage) {
            if (FTDPercentage < TelefloraPercentage) {
                result = (0 <= diceroll && diceroll <= FTDPercentage) ? 'F' : 'T';
            } else {
                result = (0 <= diceroll && diceroll <= TelefloraPercentage) ? 'T' : 'F';
            }
        } else if (!FTDPercentage && TelefloraPercentage) {
            result = 'T';
        } else if (!TelefloraPercentage && FTDPercentage) {
            result = 'F';
        } else {
            result = diceroll > 50 ? 'F' : 'T';
        }
        return result;
    }

    function setDestination(shipment, type) {
        _.each(shipment, function(li) {
            li.xp.Destination = type;
            li.xp.Status = 'OnHold';
        });
    }

    function getLineTotalSum(lineitems) {
        var lineTotal = _.pluck(lineitems, 'LineTotal');
        return _.reduce(lineTotal, function(a, b) {
            return a + b;
        }, 0);
    }

    function satisfyRequirements(lineitems, currentTotal, destination) {
        //uses the least amount of eithers to satisfy requirements
        if (currentTotal >= destination.MinOrderPrice.Price) {
            return $q.when(lineitems);
        } else {
            var add = lineitems.shift();
            currentTotal += add;
            setDestination([add], destination.type);
            return satisfyRequirements(lineitems, currentTotal, destination.MinOrderPrice.Price);
        }
    }

    function add(a, b){
        //safely adds currency by avoiding floating point math
        return ((a * 100) + (b * 100)) / 100;
    }

    return service;
}