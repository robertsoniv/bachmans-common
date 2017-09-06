angular.module('bachmans-common', [

]);

OrderCloudSDKBuyerXP.$inject = ['$provide'];angular.module('bachmans-common')
    .config(OrderCloudSDKBuyerXP);


function OrderCloudSDKBuyerXP($provide){
    $provide.decorator('OrderCloudSDK', ['$delegate', 'bachBuyerXp', '$q', function($delegate, bachBuyerXp, $q){
        $delegate.Buyers.Get = function(){
            var token = $delegate.GetToken();
            return bachBuyerXp.Get(token);
        };

        $delegate.Buyers.List = function(){
            return $delegate.Buyers.Get()
                .then(function(buyerxp){
                    return {
                        Items: [buyerxp], 
                        Meta: {
                            Page: 1, 
                            PageSize: 1, 
                            TotalPages: 1, 
                            TotalCount: 1, 
                            ItemRange: [1, 1]
                        }
                    };
                });
        };

        $delegate.Buyers.Update = function(){
            var update = [].slice.call(arguments)[1]; //update obj is second argument
            var token = $delegate.GetToken();
            if(update && update.xp) {
                return bachBuyerXp.Update(token, update.xp);
            } else {
                return $q.reject('Missing body');
            }
        };

        $delegate.Buyers.Patch = function(){
            var patch = [].slice.call(arguments)[1]; //patch obj is second argument
            var token = $delegate.GetToken();
            if(patch) {
                return bachBuyerXp.Patch(token, patch);
            } else {
                return $q.reject('Missing body');
            }
        };

        return $delegate;
    }]);
}

bachAssignments.$inject = ['nodeapiurl', '$resource', 'OrderCloudSDK'];angular.module('bachmans-common')
    .factory('bachAssignments', bachAssignments);

function bachAssignments(nodeapiurl, $resource, OrderCloudSDK) {
    var service = {
        UserGroup: _userGroup
    };

    function _userGroup(assignment) {
        return $resource(nodeapiurl + '/assignments/usergroup', {}, {
            call: {
                method: 'POST', 
                headers: {
                    'oc-token': OrderCloudSDK.GetToken()
                }
            }
        }).call(assignment).$promise;
    }

    return service;
}

bachBuyerXpService.$inject = ['$q', '$http', '$interval', 'nodeapiurl'];
angular.module('bachmans-common')
    .factory('bachBuyerXp', bachBuyerXpService)
;

function bachBuyerXpService($q, $http, $interval, nodeapiurl){
    var buyerxpurl = nodeapiurl + '/buyerxp';
    var buyerxp = null;
    var hasBeenCalled = false;
    var service = {
        Get: _get,
        Update: _update,
        Patch: _patch
    };

    function _get(token){
        var dfd = $q.defer();

        if(buyerxp){
            dfd.resolve(buyerxp);
        } else if(hasBeenCalled){
            waitForResponse();
        } else {
            hasBeenCalled = true;
            $http.get(buyerxpurl, {headers: {'oc-token': token}})
                .then(function(response){
                    buyerxp = {xp: response.data};
                    dfd.resolve(buyerxp);
                })
                .catch(function(ex){
                    dfd.reject(ex);
                });
            }

        function waitForResponse(){
            var check = $interval(function(){
                if(buyerxp){
                    $interval.cancel(check);
                    dfd.resolve(buyerxp);
                }
            }, 100);
        }

        return dfd.promise;
    }

    function _update(token, update){
        return $http.put(buyerxpurl, update, {headers: {'oc-token': token}});
    }

    function _patch(patch, token){
        return $http.patch(buyerxpurl, patch, {headers: {'oc-token': token}});
    }

    return service;
}

bachGiftCards.$inject = ['nodeapiurl', '$resource', 'toastr', '$http', 'OrderCloudSDK'];angular.module('bachmans-common')
    .factory('bachGiftCards', bachGiftCards)
;

function bachGiftCards(nodeapiurl, $resource, toastr, $http, OrderCloudSDK){
    var service = {
        Create: _create,
        Update: _update,
        Delete: _delete,
        List: _list,
        Purchase: _purchase
    };

    function _create(req){
        return GiftCards().create(req).$promise;
    }

    function _update(req){
        if(!req.body && !req.body.id) return toastr.error('id is a required parameter');
        return GiftCards().update({id: req.body.id}, req.body).$promise;
    }

    function _delete(req){
        return GiftCards().delete({id: req.id}).$promise;
    }

    function _list(req){
        return GiftCards().list(req && req.searchTerm ? {searchTerm: req.searchTerm} : null).$promise
            .then(function(results){
                return results.list;
            });
    }

    function _purchase(req){
        return $http.post(nodeapiurl + '/giftcards/purchase/' + req.orderid, {}, {headers: {'oc-token': OrderCloudSDK.GetToken()}});
    }
    
    function GiftCards(){
        var methods = {
            create: {method: 'POST'},
            update: {method: 'PUT'},
            delete: {method: 'DELETE'},
            list: {method: 'GET'}
        };
        _.each(methods, function(method){
            method.headers = {
                'oc-token': OrderCloudSDK.GetToken()
            };
        });

        return $resource(nodeapiurl + '/giftcards/:id', {}, methods);
    }

    return service;
}

bachShipmentsService.$inject = ['$q', 'buyerid', 'OrderCloudSDK', 'bachWiredOrders', '$resource', 'nodeapiurl'];angular.module('bachmans-common')
    .factory('bachShipments', bachShipmentsService)
;

function bachShipmentsService($q, buyerid, OrderCloudSDK, bachWiredOrders, $resource, nodeapiurl){
    var _buyerxp = {};
    var service = {
        Group: _group,
        Create: _create,
        List: _list,
        CalculateShippingCost: _calculateShippingCost
    };

    function _group(lineitems, buyerxp){
        _buyerxp = buyerxp;
       var initialGrouping = _.groupBy(lineitems, function(lineitem){

            var recipient = '';
            var shipto = '';
            if(lineitem.ShippingAddress){
                // every line item with a unique recipient must be a unique shipment
                recipient = (lineitem.ShippingAddress.FirstName + lineitem.ShippingAddress.LastName).replace(/ /g, '').toLowerCase();

                // every line item with a unique ship to address must be a unique shipment
                shipto = _.values(_.pick(lineitem.ShippingAddress, 'Street1', 'Street2', 'City', 'State', 'Zip', 'Country')).join('').replace(/ /g, '').toLowerCase();
            }
            
            // every line item with a unique requested delivery date must be a unique shipment
            var deliverydate = lineitem.xp.DeliveryDate || '';

            // group line items together if they are wired order - they will be further segmented later
            var wiredorder = lineitem.xp.Destination && _.contains(['T', 'F', 'E'], lineitem.xp.Destination);

            // every line item with a unique delivery method must be a unique shipment
            var deliverymethod = lineitem.xp.DeliveryMethod || '';

            var status = lineitem.xp.Status || 'Open';

            return recipient + shipto + deliverydate + deliverymethod + status + wiredorder;
        });
        return splitByProductFromStore(_.values(initialGrouping));
    }

    function splitByProductFromStore(shipments){
        // if shipment has xp.DeliveryMethod = InStorePickup then split shipment by xp.ProductFromStore
        var splitShipments = [];
        _.each(shipments, function(shipment){
            var hasInstorePickup = _.filter(shipment, function(li){
                return _.some(li.xp, {DeliveryMethod: 'InStorePickup'});
            });
            var grouped = _.groupBy(shipment, function(lineitem){
                if(hasInstorePickup){
                    return lineitem.xp.ProductFromStore;
                } else {
                    return;
                }
            });
            _.each(grouped, function(shipment){
                splitShipments.push(shipment);
            });
        });
        return splitByEvents(splitShipments);
    }

    function splitByEvents(shipments){
        // events are always a unique shipment
        _.each(shipments, function(shipment, sindex){
            _.each(shipment, function(lineitem, lindex){
                if(lineitem.Product.xp.isEvent && shipment.length > 1){
                    //splice event line items out of a shipment and into their own shipment
                    var event = shipments[sindex].splice(lindex, 1);
                    shipments.push(event);
                }
            });
        });
        return splitWiredOrders(shipments);
    }

    function splitWiredOrders(shipments){
        var splitShipments = [];
        _.each(shipments, function(shipment){
            bachWiredOrders.DetermineEithers(shipment, _buyerxp); //sets F or T for all li.xp.Destination
            
            var grouped = _.groupBy(shipment, function(li){
                return li.xp.Destination;
            });
            _.each(grouped, function(group){
                splitShipments.push(group);
            });
        });
        return shipmentTotals(splitShipments);
    }


    function shipmentTotals(shipments){
        var ftd = _.findWhere(_buyerxp.wireOrder.OutgoingOrders, {Name: 'FTD.com'});
        var tfe = _.findWhere(_buyerxp.wireOrder.OutgoingOrders, {Name: 'Teleflora.com'});
        _.each(shipments, function(shipment){
            shipment.Cost = 0;
            shipment.Tax = 0;
            shipment.FTDServiceFees = 0;
            shipment.FTDDeliveryFees = 0;
            shipment.TFEServiceFees = 0;
            shipment.TFEDeliveryFees = 0;
            _.each(shipment, function(li){
                if(li.xp) {
                    li.xp.Tax = li.xp.Tax || 0;
                    shipment.Cost = add(shipment.Cost, li.LineTotal);
                    shipment.Tax = add(shipment.Tax, li.xp.Tax);
                }
            });
            if(shipment[0].xp.Destination && shipment[0].xp.Destination === 'F'){
                shipment.FTDServiceFees = add(ftd.WiredServiceFees, shipment.FTDServiceFees);
                shipment.FTDDeliveryFees = add(ftd.WiredDeliveryFees, shipment.FTDDeliveryFees);
            }
            if(shipment[0].xp.Destination && shipment[0].xp.Destination === 'T') {
                shipment.TFEServiceFees = add(tfe.WiredServiceFees, shipment.TFEServiceFees);
                shipment.TFEDeliveryFees = add(tfe.WiredDeliveryFees, shipment.TFEDeliveryFees);
            }
            shipment.Total = add(shipment.Cost, shipment.Tax);
        });
        return shipments;
    }

    function _create(lineitems, order, buyerxp){
        var shipments = _group(lineitems, buyerxp);

        var shipmentsQueue = [];
        _.each(shipments, function(shipment, index){

            var items = [];
            _.each(shipment, function(lineitem){
                items.push({
                    'OrderID': order.ID,
                    'LineItemID': lineitem.ID,
                    'QuantityShipped': lineitem.Quantity
                });
            });
            
            var count = index + 1;
            var li = shipment[0];

            var shipmentObj = {
                'BuyerID': buyerid,
                'ID': order.ID + '-' + (count < 10 ? '0' : '') + count,
                'DateDelivered': null, // is set by integration once order is actually delivered
                'Cost': shipment.Cost, //cumulative li.LineTotal for all li in this shipment
                'Items': items,
                'xp': {
                    'Status': status(li),
                    'PrintStatus': printStatus(li),
                    'Direction': 'Outgoing', //will always be outgoing if set from app
                    'DeliveryMethod': deliveryMethod(li), //possible values: FTD, TFE, LocalDelivery, InStorePickUp, Courier, USPS, UPS, Event
                    'RequestedDeliveryDate': formatDate(li.xp.DeliveryDate),
                    'addressType': li.xp.addressType, //possible values: Residence, Funeral, Cemetary, Church, School, Hospital, Business, InStorePickUp
                    'RecipientName': li.ShippingAddress.FirstName + ' ' + li.ShippingAddress.LastName,
                    'Tax': shipment.Tax, //cumulative li.xp.Tax for all li in this shipment
                    'DeliveryCharges': '', //TODO: find out how to get this value
                    'RouteCode': li.xp.RouteCode, //alphanumeric code of the city its going to - determines which staging area product gets set to,
                    'TimePreference': li.xp.deliveryRun || 'NO PREF', // when customer prefers to receive order,
                    'ShipTo': li.ShippingAddress
                }
            };
            
            shipmentsQueue.push(nodeShipmentCreate(order.ID, shipmentObj));
        });

        return $q.all(shipmentsQueue);
    }

    function nodeShipmentCreate(orderID, shipmentObj){
        var body = {
            orderID: orderID,
            Shipment: shipmentObj
        };
        return $resource(nodeapiurl + '/shipments/create', {}, {
            call: {
                method: 'POST', 
                headers: {
                    'oc-token': OrderCloudSDK.GetToken()
                }
            }
        }).call(body).$promise;
    }

    function _list(orderID){
        var shipmentItemDictionary = {};
        var filter = {
            pageSize: 100,
            orderID: orderID
        };
        return OrderCloudSDK.Shipments.List(filter)
            .then(function(shipmentList){
                var queue = [];
                _.each(shipmentList.Items, function(shipment){
                    queue.push(function(){
                        return OrderCloudSDK.Shipments.ListItems(shipment.ID)
                            .then(function(shipmentItems){
                                shipment.Items = shipmentItems.Items;
                                _.each(shipmentItems.Items, function(item){
                                    shipmentItemDictionary[item.LineItemID] = item;
                                });
                                return shipment;
                            });
                    }());
                });
                return $q.all(queue)
                    .then(function(shipments){
                        _.each(shipments, function(shipment, shipmentKey){
                            _.each(shipment.Items, function(shipmentItems, itemKey){
                                _.each(shipmentItems.xp.AddExtraLineItemsList, function(addextraID, addExtraKey){
                                    //replace id with actual line item object (easier to access in html)
                                    shipments[shipmentKey].Items[itemKey].xp.AddExtraLineItemsList[addExtraKey] = shipmentItemDictionary[addextraID];
                                });
                            });
                        });
                        return shipments;
                    });
            });
    }

    function _calculateShippingCost(args, shipments){
        var wiredOrderCost = 0;
        var shippingCost = 0;
        var taxCost = 0;

        _.each(shipments, function(shipment){
            if(shipment.FTDDeliveryFees && shipment.FTDDeliveryFees > 0){
                wiredOrderCost = add(wiredOrderCost, shipment.FTDDeliveryFees); 
            }

            if(shipment.FTDServiceFees && shipment.FTDServiceFees > 0){
                wiredOrderCost = add(wiredOrderCost, shipment.FTDServiceFees); 
            }

            if(shipment.TFEDeliveryFees && shipment.TFEDeliveryFees > 0){
                wiredOrderCost = add(wiredOrderCost, shipment.TFEDeliveryFees); 
            }

            if(shipment.TFEServiceFees && shipment.TFEServiceFees > 0){
                wiredOrderCost = add(wiredOrderCost, shipment.TFEServiceFees); 
            }
            
        });

        return OrderCloudSDK.LineItems.List('outgoing', args).then(function(lineitemlist){
            _.each(lineitemlist.Items, function(li){
                shippingCost = add(shippingCost, li.xp.deliveryCharges || 0);
                taxCost = add(taxCost, li.xp.Tax);
            });

            return OrderCloudSDK.Orders.Patch('outgoing', args, {
                ShippingCost: wiredOrderCost || shippingCost, //only one of these will apply
                TaxCost: taxCost,
                xp: {
                    Tax: taxCost.toFixed(2)
                }
            });
        });
    }

    /* * * Start Internal Functions * * */ 

    function status(li){
        if(li.xp.Destination && _.contains(['F', 'T'], li.xp.Destination)){
            return 'OnHold';
        } else if(li.xp.Status && li.xp.Status === 'OnHold') {
            return 'OnHold';
        } else if(li.xp.addressType && _.contains(['Funeral', 'Church', 'Cemetary'], li.xp.addressType)){
            //these orders are typically difficult to fulfill so CSRs need to see them on hold screen right away
            return 'OnHold';
        } else {
            return 'New';
        }
    }

    function formatDate(datetime){
        var date = new Date(datetime);
        return (date.getMonth()+1 < 10 ? '0' +(date.getMonth() + 1) : date.getMonth() + 1) +'/'+ (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()) +'/'+ date.getFullYear();
    }

    function printStatus(li){
        if( (li.xp.DeliveryMethod === 'LocalDelivery') || ( li.xp.DeliveryMethod === 'InStorePickup' && li.xp.ProductFromStore === 'OtherStore')) {
            return 'NotPrinted';
        } else {
            return 'NotNeeded';
        }
    }

    function deliveryMethod(li){
        if(li.xp && li.xp.Destination && _.contains(['F', 'T'], li.xp.Destination)) {
            return li.xp.Destination === 'F' ? 'FTD' : 'TFE';
        } else {
            return li.xp.DeliveryMethod;
        }
    }

    function add(){
        //adds currency safely by avoiding floating point math
        return _.reduce(arguments, function(a, b){
            return ((a * 100) + (b * 100)) / 100;
        }, 0);
    }

    return service;
}

bachWiredOrdersService.$inject = ['$q'];angular.module('bachmans-common')
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