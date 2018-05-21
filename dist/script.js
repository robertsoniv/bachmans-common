angular.module('bachmans-common', [

]);

OrderCloudSDKBuyerXP.$inject = ['$provide'];angular.module('bachmans-common')
    .config(OrderCloudSDKBuyerXP);


function OrderCloudSDKBuyerXP($provide){
    $provide.decorator('OrderCloudSDK', ['$delegate', '$resource', '$q', 'blobstorageurl', 'bachmansIntegrationsUrl', function($delegate, $resource, $q, blobstorageurl, bachmansIntegrationsUrl){
        $delegate.Buyers.Get = function(){
            return $resource(blobstorageurl + '/buyerxp.json', {'guid': guid()}, {call: {
                method: 'GET',
                cache: false,
                responseType: 'json'
            }}).call().$promise.then(function(buyerxp) {
                return {xp:buyerxp};
            });
        };

        function guid() {
            function s4() {
              return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
          }

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
                return $resource(bachmansIntegrationsUrl + '/api/webdata/buyerxp', null, {call: {
                    method: 'PUT',
                    headers: {
                        Authorization: 'Bearer ' + token
                    }
                }}).call(update.xp).$promise.then(function(){
                    return $delegate.Buyers.Get();
                });
            } else {
                return $q.reject('Missing body');
            }
        };

        $delegate.Buyers.Patch = function(){ 
            return $q.reject('Use Buyers.Update instead');
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

bachGiftCards.$inject = ['nodeapiurl', '$resource', 'toastr', '$http', 'OrderCloudSDK'];angular.module('bachmans-common')
    .factory('bachGiftCards', bachGiftCards)
;

function bachGiftCards(nodeapiurl, $resource, toastr, $http, OrderCloudSDK){
    var service = {
        Create: _create,
        Update: _update,
        Delete: _delete,
        List: _list,
        Purchase: _purchase,
        Release: _release
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

    function _release(req) {
        return $http.post(nodeapiurl + '/giftcards/release/' + req.orderid, {}, {headers: {'oc-token': OrderCloudSDK.GetToken()}});
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

bachmansPurplePerks.$inject = ['$http', '$filter', '$q', 'JitterBitBaseUrl', 'environment'];angular.module('bachmans-common')
.factory('bachPP', bachmansPurplePerks);

function bachmansPurplePerks($http, $filter, $q, JitterBitBaseUrl, environment) {
var service = {
    CheckBalance: _checkBalance
}

function _checkBalance(user) {
    var date = new Date();
    var defer = $q.defer();
    var expirationDate = new Date(date.getFullYear(), 3 * (Math.ceil((date.getMonth() + 1) / 3)), 1) - 1;     
    $http.post(JitterBitBaseUrl + '/' + (environment === 'test' ? 'Test_BachmansOnPrem' : 'BachmansOnPrem') + '/PurplePerksBalanceCheck', {
        "card_number": "777777" + user.xp.LoyaltyID
        }).then(function(perks) {
                var purplePerks = {};
                if (perks.data && perks.data.card_value != "cardNumber not available" && perks.data.card_value > 0) {
                    purplePerks = {
                        Balance: Number(perks.data.card_value),
                        PointsEarned: perks.data.card_value,
                        CardNumber: "777777" + user.xp.LoyaltyID,
                        LoyaltyID: user.xp.LoyaltyID,
                        ExpirationDate: $filter('date')(expirationDate, 'MM/dd/yyyy')
                    }
                    defer.resolve(purplePerks);
                } else {
                    purplePerks = {
                        Balance: 0,
                        PointsEarned: 0,
                        CardNumber: "777777" + user.xp.LoyaltyID,
                        LoyaltyID: user.xp.LoyaltyID,
                        ExpirationDate: $filter('date')(expirationDate, 'MM/dd/yyyy')
                    }
                    defer.resolve(purplePerks);           
                }
                
            })
            .catch(function(error) {
                console.log(error);
                defer.reject(error);
                
            });
        return defer.promise;
    }
    return service;
}

bachWiredOrdersService.$inject = ['$q'];angular.module('bachmans-common')
    .factory('bachWiredOrders', bachWiredOrdersService);

function bachWiredOrdersService($q) {
    var service = {
        DetermineEithers: _determineEithers
    };

    function _determineEithers(shipment, wiredOrderSettings) {
        // E's - line items that can be shipped to either TFE or FTD (defined on li.xp.Destination = E)
        // T's - line items that can only be shipped to TFE (defined on li.xp.Destination = T)
        // F's - line items that can only be shipped to FTD (defined on li.xp.Destination = F)

        var lineitems = _getDestinations(shipment);
        var destinationGroup = _.groupBy(lineitems, function(li) {
            return li.xp.Destination;
        });

        //if there are any E's in shipment then run algorithm
        if (destinationGroup['E'] && destinationGroup['E'].length > 0) {

            var ftd = _.findWhere(wiredOrderSettings.Destinations, {
                Name: 'FTD.com'
            });

            var tfe = _.findWhere(wiredOrderSettings.Destinations, {
                Name: 'Teleflora.com'
            });

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
                var otherDestination = preferredDestination.Type === 'F' ? tfe : ftd;

                var eitherTotal = getLineTotalSum(destinationGroup['E']);
                var preferredTotal = getLineTotalSum(destinationGroup[preferredDestination.Type]);
                var otherTotal = getLineTotalSum(destinationGroup[otherDestination.Type]);

                // find least amount of E's to meet preferred's min requirements
                // send the rest to other
                if (eitherTotal + preferredTotal >= preferredDestination.MinOrderPrice) {
                    return satisfyRequirements(destinationGroup['E'], preferredTotal, preferredDestination)
                        .then(function(remainingEithers) {
                            var remainingEithersTotal = getLineTotalSum(remainingEithers);
                            if (remainingEithersTotal + otherTotal >= otherDestination.MinOrderPrice) {
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
                                destination = preferredDestination.Type;
                                return setDestination(remainingEithers, destination);
                            }
                        });

                } else if(eitherTotal + otherTotal >= otherDestination.MinOrderPrice){
                    //preferred network's requirements can't be met
                    //find least amount of E's to meet other's min reqs
                    //send the rest to preferred

                    return satisfyRequirements(destinationGroup['E'], otherTotal, otherDestination)
                        .then(function(remainingEithers){
                            if(remainingEithers){
                                destination = otherDestination.Type;
                                return setDestination(remainingEithers, destination);
                            }
                        });
                } else {
                    //neither requirements can be met
                    //split up E's based on order percentages

                    destination = diceroll(ftd.OrderPercentage, tfe.OrderPercentage);
                    return setDestination(destinationGroup['E'], preferredDestination.Type);
                }
            }
        }
    }

    function _getDestinations(lineitems) {
        lineitems = angular.copy(lineitems);
        _.each(lineitems, function(line) {
            var codeB4s = ['F', 'T', 'E'];
            if (_.contains(codeB4s, line.Product.xp.CodeB4) && line.Product.xp.CodeB2 === 'Y' && line.xp.DeliveryMethod !== 'LocalDelivery') {
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
        if (currentTotal >= destination.MinOrderPrice) {
            return $q.when(lineitems);
        } else {
            var add = lineitems.shift();
            currentTotal += add;
            setDestination([add], destination.Type);
            return satisfyRequirements(lineitems, currentTotal, destination.MinOrderPrice);
        }
    }

    return service;
}