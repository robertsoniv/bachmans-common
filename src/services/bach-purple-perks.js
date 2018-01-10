angular.module('bachmans-common')
.factory('bachPP', bachmansPurplePerks);

function bachmansPurplePerks($http, $filter, $q, JitterBitBaseUrl) {
var service = {
    CheckBalance: _checkBalance
}

function _checkBalance(user) {
    var date = new Date();
    var defer = $q.defer();
    var expirationDate = new Date(date.getFullYear(), 3 * (Math.ceil((date.getMonth() + 1) / 3)), 1) - 1;     
    $http.post(JitterBitBaseUrl + '/BachmansOnPrem/PurplePerksBalanceCheck', {
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