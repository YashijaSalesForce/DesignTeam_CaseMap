public with sharing class CaseMapController {
    
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getCaseData() {
        try {
            // 디버깅용 로그
            System.debug('=== getCaseData 시작 ===');
            
            // Case 조회 (1단계 관계만 사용)
            List<Case> cases = [
                SELECT Id, CaseNumber, Subject, Description, Status, Priority,
                       EstimatedDelay__c, Construction_Issue__c, CreatedDate,
                       RelatedConstruction__c,
                       RelatedConstruction__r.Phase__c,
                       RelatedConstruction__r.Progress__c,
                       RelatedConstruction__r.Hotel_Account__c
                FROM Case
                WHERE OwnerId = :UserInfo.getUserId()
                AND Type = '시공 문제'
                AND Status != 'Closed'
                AND RelatedConstruction__c != null
                AND RelatedConstruction__r.Hotel_Account__c != null
                ORDER BY EstimatedDelay__c DESC NULLS LAST, CreatedDate DESC
                LIMIT 50
            ];
            
            System.debug('조회된 Case 수: ' + cases.size());
            
            // Hotel Account ID 수집
            Set<Id> hotelAccountIds = new Set<Id>();
            for (Case c : cases) {
                if (c.RelatedConstruction__r != null && c.RelatedConstruction__r.Hotel_Account__c != null) {
                    hotelAccountIds.add(c.RelatedConstruction__r.Hotel_Account__c);
                }
            }
            
            System.debug('수집된 Account ID 수: ' + hotelAccountIds.size());
            
            // Account 정보 조회 - WHERE 절에서 Geolocation 필터 제거
            Map<Id, Account> accountMap = new Map<Id, Account>([
                SELECT Id, Name, Phone, 
                       BillingStreet,
                       Account_Location__c
                FROM Account
                WHERE Id IN :hotelAccountIds
            ]);
            
            System.debug('조회된 Account 수: ' + accountMap.size());
            
            // Case 데이터를 프론트엔드 형식으로 변환
            List<Map<String, Object>> caseList = new List<Map<String, Object>>();
            
            for (Case c : cases) {
                // Account 정보 확인
                Id hotelAccountId = c.RelatedConstruction__r.Hotel_Account__c;
                Account hotelAccount = accountMap.get(hotelAccountId);
                
                // Account가 없으면 건너뜀
                if (hotelAccount == null) {
                    System.debug('Account를 찾을 수 없음: ' + hotelAccountId);
                    continue;
                }
                
                // 위치 정보가 없으면 건너뜀
                if (hotelAccount.Account_Location__c == null) {
                    System.debug('위치 정보 없음 - Account: ' + hotelAccount.Name);
                    continue;
                }
                
                Map<String, Object> caseData = new Map<String, Object>();
                caseData.put('id', c.Id);
                caseData.put('caseNumber', c.CaseNumber);
                caseData.put('subject', c.Subject);
                caseData.put('description', c.Description);
                caseData.put('status', c.Status);
                caseData.put('priority', c.Priority);
                caseData.put('estimatedDelay', c.EstimatedDelay__c != null ? c.EstimatedDelay__c : 0);
                caseData.put('issueCategory', c.Construction_Issue__c);
                caseData.put('createdDate', c.CreatedDate);
                
                // 위치 정보 - Geolocation 필드 사용
                Location geoLocation = hotelAccount.Account_Location__c;
                caseData.put('lat', geoLocation.getLatitude());
                caseData.put('lng', geoLocation.getLongitude());
                
                // 호텔 정보
                caseData.put('hotelName', hotelAccount.Name);
                caseData.put('phone', hotelAccount.Phone);
                caseData.put('address', hotelAccount.BillingStreet);
                
                // 시공 정보 (1단계 관계만 사용)
                caseData.put('constructionPhase', c.RelatedConstruction__r.Phase__c);
                caseData.put('constructionProgress', c.RelatedConstruction__r.Progress__c != null ? c.RelatedConstruction__r.Progress__c : 0);
                
                caseList.add(caseData);
                System.debug('Case 추가됨: ' + c.CaseNumber);
            }
            
            System.debug('최종 Case 리스트 크기: ' + caseList.size());
            System.debug('=== getCaseData 종료 ===');
            
            return caseList;
            
        } catch (Exception e) {
            System.debug('오류 발생: ' + e.getMessage());
            System.debug('스택 트레이스: ' + e.getStackTraceString());
            throw new AuraHandledException('Case 데이터를 불러오는 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static void updateCaseStatus(String caseId, String newStatus) {
        try {
            Case caseToUpdate = [
                SELECT Id, Status 
                FROM Case 
                WHERE Id = :caseId 
                AND OwnerId = :UserInfo.getUserId()
                LIMIT 1
            ];
            
            caseToUpdate.Status = newStatus;
            update caseToUpdate;
            
        } catch (Exception e) {
            throw new AuraHandledException('Case 상태 업데이트 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
}