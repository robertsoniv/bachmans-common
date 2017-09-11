angular.module('bachmans-common')
    .factory('bachWiredOrders', bachWiredOrdersService);

function bachWiredOrdersService($q) {
    var service = {
        DetermineEithers: _determineEithers,
        GetServiceFees: _getServiceFees,
        GetDeliveryFees: _getDeliveryFees
    };

    function _determineEithers(shipment, buyerxp) {
        // E's - line items that can be shipped to either TFE or FTD (defined on li.xp.Destination = E)
        // T's - line items that can only be shipped to TFE (defined on li.xp.Destination = T)
        // F's - line items that can only be shipped to FTD (defined on li.xp.Destination = F)

        var lineitems = _getDestinations(shipment);
        var destinationGroup = _.groupBy(lineitems, function(li) {
            return li.xp.Destination;
        });

        //if there are any E's in shipment then run algorithm
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
                //all line items in this shipment are E's
                //determine where the ENTIRE shipment should go (either F or T)
                destination = diceroll(ftd.OrderPercentage, tfe.OrderPercentage);
                return setDestination(shipment, destination);

            } else if (nonEDestinations.length === 1) {
                //there is only one type (either F or T) in this shipment
                //set all E's to that type
                destination = nonEDestinations[0];
                return setDestination(shipment, destination);

            } else {
                //there are both F and T types in this shipment
                //figure out how many E's to send in each shipment

                var preferredDestination = ftd.OrderPercentage > tfe.OrderPercentage ? ftd : tfe; //give preference to network with higher order percentage
                var otherDestination = preferredDestination.type === 'F' ? tfe : ftd;

                var eitherTotal = getLineTotalSum(destinationGroup['E']);
                var preferredTotal = getLineTotalSum(destinationGroup[preferredDestination.type]);
                var otherTotal = getLineTotalSum(destinationGroup[otherDestination.type]);

                // find least amount of E's to meet preferred's min requirements
                // send the rest to other
                if (eitherTotal + preferredTotal >= preferredDestination.MinOrderPrice.Price) {
                    return satisfyRequirements(destinationGroup['E'], preferredTotal, preferredDestination)
                        .then(function(remainingEithers) {
                            var remainingEithersTotal = getLineTotalSum(remainingEithers);
                            if (remainingEithersTotal + otherTotal >= otherDestination.MinOrderPrice.Price) {
                                return satisfyRequirements(remainingEithers, otherTotal, otherDestination)
                                    .then(function(lastEithers) {
                                        //both requirements have been satisfied
                                        //split up the remainder based on order percentages
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

                } else if(eitherTotal + otherTotal >= otherDestination.MinOrderPrice.Price){
                    //preferred network's requirements can't be met
                    //find least amount of E's to meet other's min reqs
                    //send the rest to preferred

                    return satisfyRequirements(destinationGroup['E'], otherTotal, otherDestination)
                        .then(function(remainingEithers){
                            if(remainingEithers){
                                destination = otherDestination.type;
                                return setDestination(remainingEithers, destination);
                            }
                        });
                } else {
                    //neither requirements can be met
                    //split up E's based on order percentages

                    destination = diceroll(ftd.OrderPercentage, tfe.OrderPercentage);
                    return setDestination(destinationGroup['E'], preferredDestination.type);
                }
            }
        }
    }

    function _getServiceFees(shipments){
        var serviceFees = _.pluck(shipments, 'WiredServiceFees');
        return add.apply(null, serviceFees);
    }

    function _getDeliveryFees(shipments){
        var deliveryFees = _.pluck(shipments, 'WiredDeliveryFees');
        return add.apply(null, deliveryFees);
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

    function add(){
        //adds currency safely by avoiding floating point math
        var sum = _.reduce(arguments, function(a, b){
            return ((a * 100) + (b * 100)) / 100;
        }, 0);
        return sum;
    }

    return service;
}