angular.module('bachmans-common')
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