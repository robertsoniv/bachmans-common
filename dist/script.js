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

lineItemThrottleDecorator.$inject = ['$provide'];angular.module('bachmans-common')
    .config(lineItemThrottleDecorator)
;

//TODO: this is a temprorary solution to the performance issues described in BAC-778
// Line item list calls will only actually call the API if they are at least 2 seconds apart
// Any calls made closer together than two seconds will share the same response
function lineItemThrottleDecorator($provide) {
    $provide.decorator('OrderCloudSDK', ['$delegate', '$q', '$timeout', function($delegate, $q, $timeout) {
        var originalLineItemList = $delegate.LineItems.List;
        var currentResponse, isError = false, running = false, cacheResponse = false;

        function newLineItemsList() {
            var df = $q.defer();

            if (running) {
                checkRunning();
            } else if (cacheResponse) {
                complete();
            } else {
                //No list call is currently cached or running so send a new request
                running = true;
                originalLineItemList.apply($delegate, arguments)
                    .then(function(listResponse) {
                        currentResponse = listResponse;
                        isError = false;
                        stopRunning();
                        complete();
                    })
                    .catch(function(ex) {
                        isError = true;
                        stopRunning();
                        complete();
                    });
            }

            function stopRunning() {
                $timeout(function() {
                    cacheResponse = true;
                    newCacheTimer();
                    running = false;
                }, 100);
            }

            function newCacheTimer() {
                //Cache the response for 2 seconds
                $timeout(function() {
                    cacheResponse = false;
                }, 2000);
            }

            function checkRunning() {
                //Wait for the first request to complete and return it's result
                $timeout(function() {
                    running ? checkRunning() : complete();
                }, 100);
            }

            function complete() {
                isError ? df.reject(currentResponse) : df.resolve(currentResponse);
            }

            return df.promise;
        }

        $delegate.LineItems.List = newLineItemsList;
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
        GetCache: _getCache,
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

    function _getCache(){
        //don't use this in resolve, may not be set yet
        return buyerxp;
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

bachShipmentsService.$inject = ['$q', 'buyerid', 'OrderCloudSDK', 'bachWiredOrders', 'bachBuyerXp', '$resource', 'nodeapiurl'];angular.module('bachmans-common')
    .factory('bachShipments', bachShipmentsService)
;

function bachShipmentsService($q, buyerid, OrderCloudSDK, bachWiredOrders, bachBuyerXp, $resource, nodeapiurl){
    var service = {
        Group: _group,
        Create: _create,
        List: _list
    };

    function _group(lineitems){
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
            var buyerxp = bachBuyerXp.GetCache().xp;
            bachWiredOrders.DetermineEithers(shipment, buyerxp); //sets F or T for all li.xp.Destination
            
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
        var buyerxp = bachBuyerXp.GetCache().xp;
        var ftd = _.findWhere(buyerxp.wireOrder.OutgoingOrders, {Name: 'FTD.com'});
        _.each(shipments, function(shipment){
            shipment.Cost = 0;
            shipment.Tax = 0;
            shipment.WiredServiceFees = 0;
            shipment.WiredDeliveryFees = 0;
            shipment.DeliveryCharges = 0;
            shipment.deliveryFeesDtls = {}; //cumulative unique delivery fees details object

            var standardDeliveryCharges = 0; //charges for LocalDelivery, InStorePickUp, Courier, USPS, UPS, Event
            var wiredOrderCost = 0; //charges for TFE/FTD
            var nonDeliveryCharges = 0; //charges for Assembly, Placement etc.

            _.each(shipment, function(li){
                if(li.xp) {
                    li.xp.Tax = li.xp.Tax || 0;
                    shipment.Cost = add(shipment.Cost, li.LineTotal);
                    shipment.Tax = add(shipment.Tax, li.xp.Tax);
                }

                _.each(li.xp.deliveryFeesDtls, function(charge, type){
                    if(_.contains(['LocalDelivery', 'Standard Delivery', 'InStorePickUp', 'Courier', 'USPS', 'UPS', 'UPS Charges', 'Event'], type)){
                        standardDeliveryCharges = add(standardDeliveryCharges, charge);
                    } else {
                        nonDeliveryCharges = add(nonDeliveryCharges, charge);
                    }
                    if(!shipment.deliveryFeesDtls[type]){
                        //fee type doesn't exist - create it and set it to first val
                        shipment.deliveryFeesDtls[type] = charge;
                    } else {
                        //fee type already exists - add to it
                        shipment.deliveryFeesDtls[type] = add(shipment.deliveryFeesDtls[type], charge);
                    }
                });
            });
            if(shipment[0].xp.Destination && _.contains(['F', 'T'], shipment[0].xp.Destination) ){
                //TODO: per chris there will only be one fee for BOTH wired order types
                //so we can clean up the data model a bit - maybe store on buyerxp.wireOrder.OutgoingOrders[ServiceFee and DeliveryFee]
                shipment.WiredServiceFees = add(ftd.WiredServiceFees, shipment.WiredServiceFees);
                shipment.WiredDeliveryFees = add(ftd.WiredDeliveryFees, shipment.WiredDeliveryFees);
            }

            wiredOrderCost = shipment.WiredServiceFees + shipment.WiredDeliveryFees;

            //only either wired delivery charges OR standard delivery charges should apply - never both
            shipment.DeliveryCharges = nonDeliveryCharges + (wiredOrderCost || standardDeliveryCharges); 

            shipment.Total = add(shipment.Cost, shipment.Tax, shipment.DeliveryCharges);
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
                    'DeliveryCharges': shipment.DeliveryCharges,
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
        if(datetime){
            var date = new Date(datetime);
            return (date.getFullYear() +'/'+ date.getMonth()+ 1 < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1 +'/'+ (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()));
        } else {
            return 'N/A';
        }
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
        DetermineEithers: _determineEithers
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

    return service;
}