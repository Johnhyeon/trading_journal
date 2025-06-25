document.addEventListener('DOMContentLoaded', () => {
    
    // 각 매매 슬롯의 파일 업로드 버튼에 이벤트 리스너 추가
    const uploadInputs = document.querySelectorAll('.trade-image-upload');
    uploadInputs.forEach(input => {
        input.addEventListener('change', handleImageUpload);
    });

    const saveButton = document.getElementById('save-button');
    saveButton.addEventListener('click', saveJournalAsTextFile);

    // 오늘 날짜를 '날짜' 필드에 기본값으로 설정
    document.getElementById('trade-date').valueAsDate = new Date();

    /**
     * 이미지 파일을 받아 OCR을 수행하는 메인 핸들러 (전처리 단계 제거)
     */
    async function handleImageUpload(event) {
        if (!event.target.files || !event.target.files[0]) return;

        const slot = event.target.dataset.slot;
        const statusDiv = document.getElementById(`status-${slot}`);
        const imageFile = event.target.files[0];

        statusDiv.textContent = `텍스트 분석 중...`;
        
        try {
            // 원본 이미지를 바로 OCR 수행
            const { data: { text } } = await Tesseract.recognize(imageFile, 'eng+kor');
            
            statusDiv.textContent = `분석 완료! 데이터를 파싱합니다...`;
            
            const tradeData = parseOcrText(text);
            populateTradeData(tradeData, slot);
            
            statusDiv.textContent = `자동 입력 완료! (포지션은 직접 선택해주세요)`;

        } catch (error) {
            statusDiv.textContent = '오류가 발생했습니다. 콘솔을 확인해주세요.';
            console.error(error);
        }
    }

    /**
     * OCR 텍스트에서 포지션 인식을 제외한 나머지 정보를 추출
     */
    function parseOcrText(text) {
        const data = {};

        data.coin = (text.match(/([A-Z]+USDT)/)?.[1] || '').replace('USDT', '');

        const realizedPnlMatch = text.match(/Realized PnL\(USDT\)\s*(-?[\d.]+)/);
        if (realizedPnlMatch && realizedPnlMatch[1]) {
            const pnlValue = parseFloat(realizedPnlMatch[1]);
            data.realizedPnl = `${pnlValue.toFixed(2)} USDT`;
        } else {
            data.realizedPnl = '';
        }

        data.pnlRatio = text.match(/PnL Ratio\s*(-?[\d.]+%)/)?.[1] || '';
        data.leverage = text.match(/(\d+X)/)?.[1] || '';
        data.time = text.match(/\d{2}:\d{2}/)?.[0] || '';

        return data;
    }
    
    /**
     * OCR 데이터를 분리된 폼 요소에 채워넣기
     */
    function populateTradeData(data, slot) {
        document.getElementById(`entry-time-${slot}`).value = data.time;
        document.getElementById(`coin-${slot}`).value = data.coin; // 코인만 채움
        document.getElementById(`leverage-${slot}`).value = data.leverage;
        document.getElementById(`pnl-ratio-${slot}`).value = data.pnlRatio;
        document.getElementById(`realized-pnl-${slot}`).value = data.realizedPnl;
    }

    /**
     * 텍스트 파일 저장 시, 분리된 코인과 포지션 값을 조합
     */
    function saveJournalAsTextFile() {
        const dateValue = document.getElementById('trade-date').value;
        if (!dateValue) {
            alert('날짜를 먼저 입력해주세요.');
            return;
        }
        
        const date = new Date(dateValue);
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = weekdays[date.getUTCDay()];
        const formattedDate = `${dateValue.replace(/-/g, '.')}(${dayOfWeek})`;
        
        const initialBalance = parseFloat(document.getElementById('initial-balance').value) || 0;
        if (initialBalance === 0) {
            alert('시작 잔고를 입력해주세요.');
            return;
        }

        let totalRealizedPnl = 0;
        let fileContent = `📅 날짜: ${formattedDate}\n\n· 잔고: ${initialBalance.toFixed(4)} USDT\n`;

        for (let i = 1; i <= 3; i++) {
            const coin = document.getElementById(`coin-${i}`).value;
            if (!coin) continue;

            const position = document.getElementById(`position-${i}`).value;
            if (!position) {
                alert(`${i}차 매매의 포지션을 선택해주세요.`);
                return;
            }
            
            const coinPosition = `${coin}/${position}`;

            const entryTime = document.getElementById(`entry-time-${i}`).value;
            const leverage = document.getElementById(`leverage-${i}`).value;
            const entryReason = document.getElementById(`entry-reason-${i}`).value;
            const tp = document.getElementById(`tp-${i}`).value;
            const sl = document.getElementById(`sl-${i}`).value;
            const pnlRatio = document.getElementById(`pnl-ratio-${i}`).value;
            const realizedPnlStr = document.getElementById(`realized-pnl-${i}`).value;
            const review = document.getElementById(`review-${i}`).value;

            const realizedPnlValue = parseFloat(realizedPnlStr.replace('USDT', '')) || 0;
            totalRealizedPnl += realizedPnlValue;

            const sltpLine = `${tp || 0}%/${sl ? -sl : 0}%`;

            fileContent += `
✅ [${i}차 매매]
· 진입시간: ${entryTime}

· 진입코인/포지션: ${coinPosition}
· 레버리지/비중: ${leverage}

· 진입 근거:
${entryReason}

· 익절/손절라인: ${sltpLine}

· 결과: ${pnlRatio} (${realizedPnlStr})
· 복기:
${review}
`;
        }

        const totalPnlRatio = initialBalance > 0 ? (totalRealizedPnl / initialBalance * 100).toFixed(2) : 0;
        const finalBalance = initialBalance + totalRealizedPnl;

        fileContent += `
✍️ 오늘의 총 수익률: ${totalPnlRatio}% (${totalRealizedPnl.toFixed(2)} USDT)
✍️ 오늘의 최종 잔고: ${finalBalance.toFixed(2)} USDT
`;
        
        const blob = new Blob([fileContent.trim()], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `매매일지-${dateValue}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    }
});