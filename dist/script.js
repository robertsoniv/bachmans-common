angular.module('bachmans-common', [

]);

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

bachShipmentsService.$inject = ['$q', 'buyerid', 'OrderCloudSDK'];angular.module('bachmans-common')
    .factory('bachShipments', bachShipmentsService)
;

function bachShipmentsService($q, buyerid, OrderCloudSDK){
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

            // every line item with a unique delivery method must be a unique shipment
            var deliverymethod = lineitem.xp.DeliveryMethod || '';
            
            // every line item with a unique status must be a unique shipment
            // normalize statuses - previously FTDIncoming/Outgoing and TFEIncoming/Outgoing
            if(lineitem.xp.Status && lineitem.xp.Status.indexOf('FTD') > -1) lineitem.xp.Status = 'FTD';
            if(lineitem.xp.Status && lineitem.xp.Status.indexOf('TFE') > -1) lineitem.xp.Status = 'TFE';
            var status = lineitem.xp.Status || 'Open';

            return recipient + shipto + deliverydate + deliverymethod + status;
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
                if(li && li.xp) {
                    li.xp.Tax = li.xp.Tax || 0;
                    shipment.Cost = ((shipment.Cost * 100) + li.LineTotal * 100) / 100;
                    shipment.Tax = ((shipment.Tax * 100) + li.xp.Tax * 100) / 100;
                }
            });
            shipment.Total = ((shipment.Cost * 100) + (shipment.Tax)) / 100;
        });
        return shipments;
    }

    function _create(lineitems, order, fromSF){
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
                'Cost': shipment.Cost, //cumulative li.LineTotal for all li in this shipment
                'Items': items,
                'xp': {
                    'Status': status(li),
                    'PrintStatus': printStatus(li),
                    'Direction': 'Outgoing', //will always be outgoing if set from app
                    'DeliveryMethod': li.xp.DeliveryMethod, //possible values: LocalDelivery, FTD, TFE, InStorePickUp, Courier, USPS, UPS, Event
                    'RequestedDeliveryDate': formatDate(li.xp.DeliveryDate),
                    'addressType': li.xp.addressType, //possible values: Residence, Funeral, Cemetary, Church, School, Hospital, Business, InStorePickUp
                    'RecipientName': li.ShippingAddress.FirstName + ' ' + li.ShippingAddress.LastName,
                    'Tax': shipment.Tax, //cumulative li.xp.Tax for all li in this shipment
                    'RouteCode': li.xp.RouteCode, //alphanumeric code of the city its going to - determines which staging area product gets set to,
                    'TimePreference': li.xp.deliveryRun || 'NO PREF', // when customer prefers to receive order,
                    'ShipTo': li.ShippingAddress
                }
            };
            if(fromSF){
                //SF cant't have a shipments decorator (doesnt work with impersonated calls) 
                // so we need to explicitly call save item with impersonated AsAdmin method

                //TODO: consider moving this to an integration so we dont need this hacky workaround
                // and can remove ShipmentAdmin role on SF
                shipmentsQueue.push(function(){
                    return OrderCloudSDK.AsAdmin().Shipments.Create(shipmentObj)
                        .then(function(shipmentResponse){
                            var queue = [];
                            _.each(shipmentObj.Items, function(item){
                                shipmentResponse.Items = [];
                                shipmentResponse.Items.push(item);
                                queue.push(OrderCloudSDK.AsAdmin().Shipments.SaveItem(shipmentResponse.ID, item));
                            });
                            return $q.all(queue)
                                .then(function(){
                                    return shipmentResponse;
                                });
                        });
                }());
            } else {
                shipmentsQueue.push(OrderCloudSDK.Shipments.Create(shipmentObj));
            }
            
        });

        return $q.all(shipmentsQueue);
    }

    /* * * Start Internal Functions * * */ 

    function status(li){
        if(li.xp.DeliveryMethod && (li.xp.DeliveryMethod.indexOf('FTD') > -1 || li.xp.DeliveryMethod.indexOf('TFE') > -1)){
            return 'OnHold';
        } else if(li.xp.Status && li.xp.Status === 'OnHold') {
            return 'OnHold';
        } else if(li.xp.addressType && ['Funeral', 'Church', 'Cemetary'].indexOf(li.xp.addressType) > -1){
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

    return service;
}

bachWiredOrdersService.$inject = ['$q'];angular.module('bachmans-common')
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