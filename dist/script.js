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

bachShipmentsService.$inject = ['$q', 'buyerid'];angular.module('orderCloud')
    .factory('bachShipments', bachShipmentsService)
;

function bachShipmentsService($q, buyerid){
    var service = {
        Breakup: _breakup
    };

    function _breakup(lineitems, orderid, deliverydate){
        return splitByUniqueRecipient([lineitems])
            .then(splitByShipTo)
            .then(splitByDeliveryDate)
            .then(splitByShippingMethod)
            .then(function(shipments){
                createShipments(shipments, orderid, deliverydate);
            });
    }


    function splitByUniqueRecipient(lineitems){
        // every line item with a unique recipient must be a unique shipment
        var iteratee = function(lineitem){
            return (lineitem.ShippingAddress.FirstName + lineitem.ShippingAddress.LastName).replace(/ /g, '').toLowerCase();
        };
        return splitShipments(lineitems, iteratee);
    }

    function splitByShipTo(shipments){
        // every line item with a unique ship to address must be a unique shipment
        var iteratee = function(lineitem){
            var stringifiedShipTo = _.values(_.pick(lineitem.ShippingAddress, 'Street1', 'Street2', 'City', 'State', 'Zip', 'Country')).join('').replace(/ /g, '').toLowerCase();
            return stringifiedShipTo;
        };
        return splitShipments(shipments, iteratee);
    }

    function splitByDeliveryDate(shipments){
        // every line item with a unique requested delivery date must be a unique shipment
        var iteratee = function(lineitem){
            return lineitem.xp.DeliveryDate;
        };
        return splitShipments(shipments, iteratee);
    }

    function splitByShippingMethod(shipments){
        // every line item with a unique shipping method must be a unique shipment
        var iteratee = function(lineitem){
            return lineitem.xp.DeliveryMethod;
        };
        return splitShipments(shipments, iteratee);
    }

    function createShipments(shipments, orderid, deliverydate){
        _.each(shipments, function(shipment, index){
            var items = [];
            var shipmentCost = 0;
            _.each(shipment, function(lineitem){
                items.push({
                    'OrderID': lineitem.OrderID,
                    'LineItemID': lineitem.ID,
                    'QuantityShipped': lineitem.Quantity
                });
                shipmentCost = ((shipmentCost * 100) + (lineitem.xp.TotalCost * 100)) / 100;
            });
            var count = index + 1;
            var shipmentObj = {
                'BuyerID': buyerid,
                'ID': orderid + '-' + (count < 10 ? '0' : '') + count,
                'DateDelivered': formatDate(deliverydate),
                'Cost': shipmentCost,
                'Items': items,
                'xp': {
                    'Status': 'New',
                    'addressType': vm.activeOrders[n][0].xp.addressType,
                    'RecipientName': vm.activeOrders[n][0].ShippingAddress.FirstName + ' ' + vm.activeOrders[n][0].ShippingAddress.LastName,
                    'Tax': Tax,
                    'DeliveryFees': DeliveryFees,
                    'CSRID': CurrentUser.ID
                }
            };
        });
    }

    /* * * Start Internal Functions * * */ 

    function splitShipments(shipments, iteratee){
        // splits shipments up, grouped by the result of running
        // each line item within a shipment through an iteratee function
        var splitshipments = [];
        _.each(shipments, function(shipment){
            var grouped = _.groupBy(shipment, function(lineitem){
                return iteratee(lineitem);
            });
            _.each(grouped, function(shipment){
                splitshipments.push(shipment);
            });
        });
        return $q.when(splitshipments);
    }

    function formatDate(datetime){
        var date = new Date(datetime);
        return (date.getMonth()+1 < 10 ? '0' +(date.getMonth() + 1) : date.getMonth() + 1) +'/'+ (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()) +'/'+ date.getFullYear();
    }

    return service;
}

bachShipmentsService.$inject = ['$q', 'buyerid', 'OrderCloudSDK'];angular.module('orderCloud')
    .factory('bachShipments', bachShipmentsService)
;

function bachShipmentsService($q, buyerid, OrderCloudSDK){
    var service = {
        Breakup: _breakup
    };

    function _breakup(lineitems, order){
        return splitShipments(lineitems)
            .then(splitByProductFromStore)
            .then(splitByEvents)
            .then(function(shipments){
                return createShipments(shipments, order);
            });
    }

    function splitShipments(lineitems){
       var grouped = _.groupBy(lineitems, function(lineitem){

            // every line item with a unique recipient must be a unique shipment
            var recipient = (lineitem.ShippingAddress.FirstName + lineitem.ShippingAddress.LastName).replace(/ /g, '').toLowerCase();

            // every line item with a unique ship to address must be a unique shipment
            var shipto = _.values(_.pick(lineitem.ShippingAddress, 'Street1', 'Street2', 'City', 'State', 'Zip', 'Country')).join('').replace(/ /g, '').toLowerCase();

            // every line item with a unique requested delivery date must be a unique shipment
            var deliverydate = lineitem.xp.DeliveryDate;

            // every line item with a unique delivery method must be a unique shipment
            var deliverymethod = lineitem.xp.DeliveryMethod;
            

            return recipient + shipto + deliverydate + deliverymethod;
        });
        return $q.when(_.values(grouped));
    }

    function splitByProductFromStore(shipments){
        // if shipment has xp.DeliveryMethod = InStorePickup then split shipment by xp.ProductFromStore
        var splitShipments = [];
        _.each(shipments, function(shipment){
            var grouped = _.groupBy(shipment, function(lineitem){
                var hasInstorePickup = _.filter(shipment, function(li){
                    return _.some(li.xp, {DeliveryMethod: 'InStorePickup'});
                });
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
        return $q.when(splitShipments);
    }

    function splitByEvents(shipments){
        // events are always a unique shipment
        if(true) return $q.when(shipments); //TODO: remove this once Product.xp value for identifying a product event is defined
        var splitShipments = [];
        _.each(shipments, function(shipment, sindex){
            _.each(shipment, function(lineitem, lindex){
                if(lineitem.Product.xp.isEvent && shipment.length > 1){ //TODO: replace with correct value
                    var event = shipment[sindex].splice(lindex, 1);
                    splitShipments.push(event);
                }
            });
        });
        return $q.when(splitShipments);
    }

    function createShipments(shipments, order){
        var shipmentsQueue = [];
        _.each(shipments, function(shipment, index){

            var items = [];
            var cost = 0;
            var tax = 0;

            _.each(shipment, function(lineitem){
                items.push({
                    'OrderID': order.ID,
                    'LineItemID': lineitem.ID,
                    'QuantityShipped': lineitem.Quantity
                });
                cost = ((cost * 100) + (lineitem.LineTotal * 100)) / 100;
                tax = ((tax * 100) + (lineitem.xp.Tax * 100)) / 100;
            });
            
            var count = index + 1;
            var li = shipment[0];

            var shipmentObj = {
                'BuyerID': buyerid,
                'ID': order.ID + '-' + (count < 10 ? '0' : '') + count,
                'DateDelivered': null, // is set by integration once order is actually delivered
                'Cost': cost,
                'Items': items,
                'xp': {
                    'Status': status(li),
                    'PrintStatus': printStatus(li),
                    'Direction': 'Outgoing', //will always be outgoing if set from app
                    'DeliveryMethod': li.xp.DeliveryMethod, //possible values: LocalDelivery, FTD, TFE, InStorePickUp, Courier, USPS, Event
                    'RequestedDeliveryDate': formatDate(li.xp.DeliveryDate),
                    'addressType': li.xp.addressType, //possible values: Residence, Funeral, Cemetary, Church, School, Hospital, Business, InStorePickUp
                    'RecipientName': li.ShippingAddress.FirstName + ' ' + li.ShippingAddress.LastName,
                    'Tax': tax,
                    'RouteCode': li.xp.RouteCode, //alphanumeric code of the city its going to - determines which staging area product gets set to,
                    'TimePreference': li.xp.deliveryRun || 'None', // when customer prefers to receive order,
                    'ShipTo': li.ShippingAddress
                }
            };
            shipmentsQueue.push(OrderCloudSDK.Shipments.Create(shipmentObj));
        });


        return $q.all(shipmentsQueue)
            .then(function(data){
                console.log(data);
            });
    }

    /* * * Start Internal Functions * * */ 

    function status(li){
        if(li.xp.DeliveryMethod === 'FTD' || li.xp.DeliveryMethod === 'TFE'){
            return 'OnHold';
        } else if(li.xp.Status && li.xp.Status.length) {
            return li.xp.Status;
        } else {
            return 'New';
        }
    }

    function formatDate(datetime){
        var date = new Date(datetime);
        return (date.getMonth()+1 < 10 ? '0' +(date.getMonth() + 1) : date.getMonth() + 1) +'/'+ (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()) +'/'+ date.getFullYear();
    }

    function printStatus(li){
        if( (li.xp.DeliveryMethod === 'LocalDelivery' || li.xp.DeliveryMethod === 'InStorePickup') && li.xp.ProductFromStore === 'OtherStore') {
            return 'NotPrinted';
        } else {
            return 'NotNeeded';
        }
    }

    return service;
}