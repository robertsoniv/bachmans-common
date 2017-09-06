angular.module('bachmans-common')
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