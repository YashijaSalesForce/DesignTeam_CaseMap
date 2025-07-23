import { LightningElement, track } from 'lwc';
import { loadStyle, loadScript } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LEAFLET_CSS from '@salesforce/resourceUrl/leafletCSS';
import LEAFLET_JS from '@salesforce/resourceUrl/leafletJS';
import getCaseData from '@salesforce/apex/CaseMapController.getCaseData';
import updateCaseStatus from '@salesforce/apex/CaseMapController.updateCaseStatus';

export default class DesignTeamCaseMap extends LightningElement {
    @track isLoading = false;
    @track errorMessage = '';
    @track isMapInitialized = false;
    @track caseData = [];
    
    map;
    markerLayers = {};
    
    // 기본 중심점 (본사)
    defaultCenter = {
        lat: 37.4449168,
        lng: 127.1388684
    };

    // 본사 데이터 (프론트엔드 더미 데이터)
    headquartersData = {
        lat: 37.4449168,
        lng: 127.1388684,
        name: '야쉬자 본사',
        description: '텐엑스타워',
        address: '경기도 성남시 수정구 금토로 70'
    };

    // 현재위치
    currentLocation = {
        lat: 37.4449168,
        lng: 127.1388684,
        name: '현재 위치'
    };

    connectedCallback() {
        this.loadLeafletResources();
    }

    // Leaflet 리소스 로딩
    async loadLeafletResources() {
        try {
            await Promise.all([
                loadStyle(this, LEAFLET_CSS),
                loadScript(this, LEAFLET_JS)
            ]);
            
            console.log('Leaflet 리소스 로딩 완료');
            this.initializeMap();
        } catch (error) {
            console.error('Leaflet 리소스 로딩 실패:', error);
            this.errorMessage = 'Leaflet 라이브러리를 불러올 수 없습니다.';
        }
    }

    // 지도 초기화
    async initializeMap() {
        try {
            const mapContainer = this.template.querySelector('.map-div');
            
            if (!mapContainer) {
                console.error('지도 컨테이너를 찾을 수 없습니다');
                return;
            }

            // Leaflet 지도 생성
            this.map = L.map(mapContainer).setView([this.defaultCenter.lat, this.defaultCenter.lng], 11);

            // OpenStreetMap 타일 레이어 추가
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(this.map);

            // 마커 레이어 그룹 초기화
            this.initializeMarkerLayers();
            
            // 데이터 로드 및 마커 추가
            await this.loadCaseData();
            
            this.isMapInitialized = true;
            console.log('지도 초기화 완료');
            
        } catch (error) {
            console.error('지도 초기화 실패:', error);
            this.errorMessage = '지도를 초기화할 수 없습니다.';
        }
    }

    // 마커 레이어 그룹 초기화
    initializeMarkerLayers() {
        this.markerLayers.headquarters = L.layerGroup().addTo(this.map);
        this.markerLayers.cases = L.layerGroup().addTo(this.map);
    }

    // Case 데이터 로드
    async loadCaseData() {
        try {
            this.isLoading = true;
            const data = await getCaseData();
            
            if (data) {
                // 본사 마커 추가 (프론트엔드 데이터 사용)
                this.addHeadquartersMarker(this.headquartersData);
                
                // Case 데이터 저장 및 마커 추가
                if (data.length > 0) {
                    this.caseData = data;
                    this.addCaseMarkers();
                } else {
                    console.log('Case 데이터가 없습니다.');
                }
            }
        } catch (error) {
            console.error('Case 데이터 로드 실패:', error);
            this.showToast('오류', 'Case 데이터를 불러올 수 없습니다.', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // 본사 마커 추가
    addHeadquartersMarker(data) {
        const icon = L.divIcon({
            html: `
                <div class="marker headquarters">
                    <div class="marker-icon"></div>
                    <div class="marker-label">${data.name}</div>
                </div>
            `,
            className: 'custom-marker-container',
            iconSize: [50, 60],
            iconAnchor: [25, 50]
        });
        
        const popupContent = `
            <div style="margin-bottom: 8px;">
                <strong style="color: #080707; font-size: 14px;">${data.name}</strong>
            </div>
            <div style="font-size: 13px; color: #706E6B;">
                <div>${data.description}</div>
                <div>${data.address}</div>
            </div>
        `;
        
        const marker = L.marker([data.lat, data.lng], { icon: icon })
            .bindPopup(popupContent, { autoPan: false });

        marker.on('click', (e) => {
            this.map.setView(e.latlng, this.map.getZoom());
            setTimeout(() => {
                marker.openPopup();
            }, 300);
        });

        this.markerLayers.headquarters.addLayer(marker);
    }

    // Case 마커들 추가
    addCaseMarkers() {
        // 기존 Case 마커 제거
        this.markerLayers.cases.clearLayers();
        
        this.caseData.forEach(caseItem => {
            const marker = this.createCaseMarker(caseItem);
            this.markerLayers.cases.addLayer(marker);
        });
    }

    // Case 마커 생성
    createCaseMarker(data) {
        // 예상 지연일수에 따른 색상 결정
        const delayDays = data.estimatedDelay || 0;
        let markerColor, urgencyLevel;
        
        if (delayDays >= 3) {
            markerColor = '#FF0000'; // 빨강
            urgencyLevel = 'high';
        } else if (delayDays >= 1) {
            markerColor = '#FFA500'; // 주황
            urgencyLevel = 'medium';
        } else {
            markerColor = '#FFD700'; // 노랑
            urgencyLevel = 'low';
        }
        
        const icon = L.divIcon({
            html: `
                <div class="marker case ${urgencyLevel}">
                    <div class="marker-icon" style="background: ${markerColor};">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                    </div>
                    <div class="marker-delay">${delayDays}일</div>
                </div>
            `,
            className: 'custom-marker-container',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
        
        const popupContent = this.createCasePopupContent(data);
        const marker = L.marker([data.lat, data.lng], { icon: icon })
            .bindPopup(popupContent, { autoPan: false });

        marker.on('click', (e) => {
            this.map.setView(e.latlng, this.map.getZoom());
            setTimeout(() => {
                marker.openPopup();
            }, 300);
        });

        // 마커에 Case ID 저장 (나중에 참조용)
        marker.caseId = data.id;

        return marker;
    }

    // Case 팝업 내용 생성
    createCasePopupContent(data) {
        const directionsUrl = this.generateDirectionsUrl(data.hotelName, data.lat, data.lng);
        
        return `
            <div style="min-width: 250px;">
                <div style="margin-bottom: 8px;">
                    <strong style="color: #080707; font-size: 14px;">${data.hotelName}</strong>
                    <span style="font-size: 12px; color: #706E6B;"> - ${data.caseNumber}</span>
                </div>
                <div style="font-size: 13px; color: #706E6B; margin-bottom: 12px;">
                    <div><strong>문제:</strong> ${data.subject || '제목 없음'}</div>
                    <div><strong>카테고리:</strong> ${data.issueCategory || '미분류'}</div>
                    <div><strong>예상 지연:</strong> <span style="color: ${data.estimatedDelay >= 3 ? '#FF0000' : data.estimatedDelay >= 1 ? '#FFA500' : '#FFD700'}; font-weight: bold;">${data.estimatedDelay || 0}일</span></div>
                    <div><strong>진행 단계:</strong> ${data.constructionPhase || '-'} (${data.constructionProgress || 0}%)</div>
                    ${data.phone ? `<div><strong>연락처:</strong> ${data.phone}</div>` : ''}
                    <div><strong>주소:</strong> ${data.address || '-'}</div>
                </div>
                <div class="popup-buttons">
                    <a href="${directionsUrl}" target="_blank" class="popup-btn directions">
                        <svg viewBox="0 0 24 24"><path d="M2,3L2,9L7,12L2,15L2,21L22,12L2,3Z"/></svg>
                        경로
                    </a>
                    <button onclick="window.handleCaseResolve('${data.id}')" class="popup-btn resolve">
                        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        해결
                    </button>
                </div>
            </div>
        `;
    }

    // 카카오맵 길찾기 URL 생성
    generateDirectionsUrl(destinationName, lat, lng) {
        const encodedName = encodeURIComponent(destinationName);
        return `https://map.kakao.com/link/to/${encodedName},${lat},${lng}`;
    }

    // 홈 버튼 클릭 (본사로 이동)
    goToHome() {
        if (this.map) {
            this.map.setView([this.defaultCenter.lat, this.defaultCenter.lng], 13);
            
            this.markerLayers.headquarters.eachLayer(layer => {
                if (layer.openPopup) {
                    setTimeout(() => layer.openPopup(), 500);
                }
            });
        }
    }

    // 현재위치 버튼 클릭
    goToCurrentLocation() {
        if (this.map) {
            this.map.setView([this.currentLocation.lat, this.currentLocation.lng], 15);
            
            // 현재위치 마킹
            const currentLocationIcon = L.divIcon({
                html: `
                    <div class="marker current-location">
                        <div class="marker-center">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                            </svg>
                        </div>
                        <div class="marker-ring"></div>
                        <div class="marker-ring-outer"></div>
                    </div>
                `,
                className: 'custom-marker-container',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
            
            if (this.currentLocationMarker) {
                this.map.removeLayer(this.currentLocationMarker);
            }
            
            this.currentLocationMarker = L.marker([this.currentLocation.lat, this.currentLocation.lng], { icon: currentLocationIcon })
                .addTo(this.map);
        }
    }

    // Case 위치로 이동
    handleMoveToLocation(event) {
        const caseId = event.currentTarget.dataset.caseId;
        const caseItem = this.caseData.find(item => item.id === caseId);
        
        if (caseItem && this.map) {
            this.map.setView([caseItem.lat, caseItem.lng], 16);
            
            // 해당 Case 마커의 팝업 열기
            this.markerLayers.cases.eachLayer(layer => {
                if (layer.caseId === caseId) {
                    setTimeout(() => layer.openPopup(), 500);
                }
            });
        }
    }

    // Case 해결 처리
    async handleCaseResolve(caseId) {
        try {
            this.isLoading = true;
            await updateCaseStatus({ caseId: caseId, newStatus: 'Closed' });
            
            this.showToast('성공', 'Case가 해결 처리되었습니다.', 'success');
            
            // 데이터 새로고침
            await this.loadCaseData();
        } catch (error) {
            console.error('Case 해결 처리 실패:', error);
            this.showToast('오류', 'Case 해결 처리 중 오류가 발생했습니다.', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // 새로고침
    async handleRefresh() {
        await this.loadCaseData();
    }

    // Toast 메시지 표시
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }

    // 전역 함수로 등록 (팝업에서 호출)
    renderedCallback() {
        if (!window.handleCaseResolve) {
            window.handleCaseResolve = this.handleCaseResolve.bind(this);
        }
    }

    // 정렬되고 가공된 Case 데이터 getter
    get sortedCaseData() {
        return [...this.caseData]
            .sort((a, b) => {
                // 예상 지연일수로 내림차순 정렬
                const delayA = a.estimatedDelay || 0;
                const delayB = b.estimatedDelay || 0;
                return delayB - delayA;
            })
            .map(item => ({
                ...item,
                delayClass: this.getDelayClass(item.estimatedDelay)
            }));
    }

    // 지연일수에 따른 스타일 클래스
    getDelayClass(days) {
        const delay = days || 0;
        if (delay >= 3) return 'delay-high';
        if (delay >= 1) return 'delay-medium';
        return 'delay-low';
    }
}