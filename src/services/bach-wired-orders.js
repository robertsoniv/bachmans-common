angular.module('bachmans-common')
    .factory('bachWiredOrders', bachWiredOrdersService)
;

function bachWiredOrdersService($q){
    var service = {
        DetermineEithers: _determineEithers  
    };

    function _determineEithers(shipment, buyerxp){
        //renewDestinations(shipment);
        var groupedByDestination = _.groupBy(shipment, function(li){
            return li.xp.Destination;
        });

        if(groupedByDestination['E'] && groupedByDestination['E'].length > 0){

            var ftd = _.findWhere(buyerxp.wireOrder.OutgoingOrders, {Name: 'FTD.com'});
            var tfe = _.findWhere(buyerxp.wireOrder.OutgoingOrders, {Name: 'Teleflora.com'});
            ftd.type = 'FTD'; //TODO: get rid of these potentially by storing on docdb instead, maybe not though idk
            tfe.type = 'TFE';
    
            var nonEDestinations = _.without(_.keys(groupedByDestination), 'E');
            var destination;

            if(nonEDestinations.length === 0){
                destination = diceroll(ftd.OrderPercentage, tfe.OrderPercentage);
                return setDestination(shipment, destination);

            } else if(nonEDestinations.length === 1){
                destination = nonEDestinations[0];
                return setDestination(shipment, destination);

            } else {
                var preferredDestination = ftd.OrderPercentage > tfe.OrderPercentage ? ftd : tfe;
                var otherDestination = preferredDestination.type === 'FTD' ? tfe : ftd;
                
                var eitherTotal = getLineTotalSum(groupedByDestination['E']);
                var preferredTotal = getLineTotalSum(groupedByDestination[preferredDestination.type]);
                var otherTotal = getLineTotalSum(groupedByDestination[otherDestination.type]);

                if(eitherTotal + preferredTotal  >= preferredDestination.MinOrderPrice.Price){
                    return satisfyRequirements(groupedByDestination['E'], preferredTotal, preferredDestination)
                        .then(function(remainingEithers){
                            var remainingEithersTotal = getLineTotalSum(remainingEithers);
                            if(remainingEithersTotal + otherTotal >= otherDestination.MinOrderPrice.Price){
                                return satisfyRequirements(remainingEithers, otherTotal, otherDestination)
                                    .then(function(lastEithers){
                                        _.each(lastEithers, function(li){
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
                    if(eitherTotal + otherTotal >= otherDestination.MinOrderPrice.Price){
                        destination = otherDestination.type;
                        return setDestination(groupedByDestination['E'], otherDestination.type);
                    } else {
                        destination = preferredDestination.type;
                        return setDestination(groupedByDestination['E'], preferredDestination.type);
                    }
                }
            }
        }
    }

    function renewDestinations(lineitems){
        _.each(lineitems, function(line){
            var codeB4s = ['F', 'T', 'E'];
            if (codeB4s.indexOf(line.Product.xp['CodeB4']) > -1 && line.Product.xp['CodeB2'] === 'Y' && line.xp.DeliveryMethod !== 'LocalDelivery') {
                line.xp.deliveryCharges = 0;
                if (line.Product.xp['CodeB4'] === 'F') line.xp.Destination = 'FTD';
                if (line.Product.xp['CodeB4'] === 'T') line.xp.Destination = 'TFE';
                if (line.Product.xp['CodeB4'] === 'E') line.xp.Destination = 'E';
                line.xp.Status = 'OnHold'; //TODO: possibly just move this at shipment level
                // if (line.Product.xp['CodeB4'] !== 'E') line.xp.Status = 'OnHold';
    
                // if (line.xp.Destination === 'FTD') {
                //     var ftdorders = _.where(BuyerXp.wireOrder.OutgoingOrders, {Name: 'FTD.com'});
                //     line.xp.deliveryFeesDtls = {
                //         'FTD Service Fees': ftdorders.WiredServiceFees,
                //         'FTD Delivery Fees': ftdorders.WiredDeliveryFees
                //     };
                // }
    
                // if (line.xp.Destination === 'TFE') {
                //     var tfeorders = _.where(BuyerXp.wireOrder.OutgoingOrders, {Name: 'Teleflora.com'});
                //     line.xp.deliveryFeesDtls = {
                //         'TFE Service Fees': tfeorders.WiredServiceFees,
                //         'TFE Delivery Fees': tfeorders.WiredDeliveryFees
                //     };
                // }
            }
        });
    }

    function diceroll(FTDPercentage, TelefloraPercentage){
        var result;
        var diceroll = Math.random() * 100;
        if(FTDPercentage && TelefloraPercentage){
            if(FTDPercentage < TelefloraPercentage){
                result = (0 <= diceroll && diceroll <= FTDPercentage) ? 'FTD' : 'TFE';
            } else {
                result = (0 <= diceroll && diceroll <= TelefloraPercentage) ? 'TFE' : 'FTD';
            }
        } else if(!FTDPercentage && TelefloraPercentage){
            result = 'TFE';
        } else if(!TelefloraPercentage && FTDPercentage){
            result = 'FTD';
        } else {
            result = diceroll > 50 ? 'FTD' : 'TFE';
        }

        return result;
    }

    function setDestination(shipment, type){
        _.each(shipment, function(li){
            li.xp.Destination = type;
        });
    }

    function getLineTotalSum(lineitems){
        var lineTotal = _.pluck(lineitems, 'LineTotal');
        return _.reduce(lineTotal, function(a, b){
            return a + b;
        }, 0);
    }

    function satisfyRequirements(lineitems, currentTotal, destination){
        //uses the least amount of eithers to satisfy requirements
        if(currentTotal >= destination.MinOrderPrice.Price){
            return $q.when(lineitems);
        } else {
            var add = lineitems.shift();
            currentTotal += add;
            setDestination([add], destination.type);
            return satisfyRequirements(lineitems, currentTotal, destination.MinOrderPrice.Price);
        }
    }

    return service;
}