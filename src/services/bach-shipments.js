angular.module('bachmans-common')
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