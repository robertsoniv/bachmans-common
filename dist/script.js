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

bachGiftCards.$inject = ['nodeapiurl', '$resource', '$cookies', 'ocAppName', 'toastr', '$http'];angular.module('bachmans-common')
    .factory('bachGiftCards', bachGiftCards)
;

function bachGiftCards(nodeapiurl, $resource, $cookies, ocAppName, toastr, $http){
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
        return $http.post(nodeapiurl + '/giftcards/purchase/' + req.orderid, {}, {headers: {'oc-token': getToken()}});
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
                'oc-token': getToken()
            };
        });

        return $resource(nodeapiurl + '/giftcards/:id', {}, methods);
    }

    function getToken(){
        var cookiePrefix = ocAppName.Watch().replace(/ /g, '_').toLowerCase();
        var authTokenCookieName = cookiePrefix + '.token';
        return $cookies.get(authTokenCookieName);
    }

    return service;
}

bachShipmentsService.$inject = ['$q', 'buyerid', 'OrderCloudSDK'];angular.module('bachmans-common')
    .factory('bachShipments', bachShipmentsService)
;

function bachShipmentsService($q, buyerid, OrderCloudSDK){
    var service = {
        Group: _group,
        Create: _create
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

            // every line item with a unique delivery method must be a unique shipment
            var deliverymethod = lineitem.xp.DeliveryMethod || '';
            
            // every line item with a unique status must be a unique shipment
            var status = lineitem.xp.Status;

            return recipient + shipto + deliverydate + deliverymethod + status;
        });
        return splitByProductFromStore(_.values(initialGrouping));
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
        return splitByEvents(splitShipments);
    }

    function splitByEvents(shipments){
        // events are always a unique shipment
        _.each(shipments, function(shipment, sindex){
            _.each(shipment, function(lineitem, lindex){
                if(lineitem.Product.xp.isEvent && shipment.length > 1){
                    var event = shipment[sindex].splice(lindex, 1);
                    shipments.push(event);
                }
            });
        });
        return shipmentTotals(shipments);
    }

    function shipmentTotals(shipments){
        _.each(shipments, function(shipment){
            shipment.Cost = 0;
            shipment.Tax = 0;
            _.each(shipment, function(li){
                if(li && li.xp.Tax) {
                    shipment.Cost = ((shipment.Cost * 100) + li.LineTotal * 100) / 100;
                    shipment.Tax = ((shipment.Tax * 100) + li.xp.Tax * 100) / 100;
                }
            });
            shipment.Total = ((shipment.Cost * 100) + (shipment.Tax)) / 100;
        });
        return shipments;
    }

    function _create(lineitems, order){
        var shipments = _group(lineitems);

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
                'Cost': shipment.Cost,
                'Items': items,
                'xp': {
                    'Status': status(li),
                    'PrintStatus': printStatus(li),
                    'Direction': 'Outgoing', //will always be outgoing if set from app
                    'DeliveryMethod': li.xp.DeliveryMethod, //possible values: LocalDelivery, FTD, TFE, InStorePickUp, Courier, USPS, Event
                    'RequestedDeliveryDate': formatDate(li.xp.DeliveryDate),
                    'addressType': li.xp.addressType, //possible values: Residence, Funeral, Cemetary, Church, School, Hospital, Business, InStorePickUp
                    'RecipientName': li.ShippingAddress.FirstName + ' ' + li.ShippingAddress.LastName,
                    'Tax': shipment.Tax,
                    'RouteCode': li.xp.RouteCode, //alphanumeric code of the city its going to - determines which staging area product gets set to,
                    'TimePreference': li.xp.deliveryRun || 'NO PREF', // when customer prefers to receive order,
                    'ShipTo': li.ShippingAddress
                }
            };
            shipmentsQueue.push(OrderCloudSDK.Shipments.Create(shipmentObj));
        });

        return $q.all(shipmentsQueue);
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