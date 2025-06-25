document.addEventListener('DOMContentLoaded', () => {
    
    // 각 매매 슬롯의 파일 업로드 버튼에 이벤트 리스너 추가
    document.querySelectorAll('.trade-image-upload').forEach(input => {
        input.addEventListener('change', handleImageUpload);
    });

    // '매매 없음' 체크박스에 이벤트 리스너 추가
    document.querySelectorAll('.no-trade-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleNoTradeCheck);
    });

    document.getElementById('save-button').addEventListener('click', saveJournalAsTextFile);

    // 오늘 날짜를 '날짜' 필드에 기본값으로 설정
    document.getElementById('trade-date').valueAsDate = new Date();

    /**
     * '매매 없음' 체크 시 입력 필드를 비활성화/활성화 하는 함수
     */
    function handleNoTradeCheck(event) {
        const slot = event.target.dataset.slot;
        const fieldsContainer = document.getElementById(`trade-fields-${slot}`);
        const isChecked = event.target.checked;

        // 모든 자식 입력 요소들을 찾음
        const inputs = fieldsContainer.querySelectorAll('input, select, textarea');
        
        if (isChecked) {
            fieldsContainer.classList.add('disabled');
            inputs.forEach(input => input.disabled = true);
        } else {
            fieldsContainer.classList.remove('disabled');
            inputs.forEach(input => input.disabled = false);
        }
    }

    /**
     * 이미지 파일을 받아 OCR을 수행하는 메인 핸들러
     */
    async function handleImageUpload(event) {
        if (!event.target.files || !event.target.files[0]) return;

        const slot = event.target.dataset.slot;
        const statusDiv = document.getElementById(`status-${slot}`);
        const imageFile = event.target.files[0];

        // 잔고 사용률 계산을 위해 시작 잔고가 입력되었는지 먼저 확인
        const initialBalance = parseFloat(document.getElementById('initial-balance').value);
        if (!initialBalance || initialBalance <= 0) {
            alert('잔고 사용률 계산을 위해 시작 잔고를 먼저 입력해주세요.');
            // 업로드 취소
            event.target.value = ''; 
            return;
        }

        statusDiv.textContent = `텍스트 분석 중...`;
        
        try {
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
        data.filled = text.match(/Filled\(USDT\)\s*([\d.]+)/)?.[1] || '';

        return data;
    }
    
    function populateTradeData(data, slot) {
        document.getElementById(`entry-time-${slot}`).value = data.time;
        document.getElementById(`coin-${slot}`).value = data.coin;
        document.getElementById(`pnl-ratio-${slot}`).value = data.pnlRatio;
        document.getElementById(`realized-pnl-${slot}`).value = data.realizedPnl;
        
        // --- 잔고 사용률 계산 및 포매팅 로직 ---
        let leverageAndPositionText = data.leverage; // 기본값

        const initialBalance = parseFloat(document.getElementById('initial-balance').value);

        if (data.leverage && data.filled && initialBalance > 0) {
            const leverageValue = parseInt(data.leverage);
            const filledValue = parseFloat(data.filled);

            if (leverageValue && filledValue && leverageValue !== 0) {
                // 비중(포지션 사이즈) 계산
                const positionSize = filledValue / leverageValue;
                // 잔고 사용률(%) 계산
                const balanceUsageRate = (positionSize / initialBalance) * 100;
                
                // 최종 양식으로 텍스트 조합
                leverageAndPositionText = `${data.leverage}/${balanceUsageRate.toFixed(0)}% (${positionSize.toFixed(0)} USDT)`;
            }
        }

        document.getElementById(`leverage-${slot}`).value = leverageAndPositionText;
    }

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
        let fileContent = `📅 날짜: ${formattedDate}\n· 잔고: ${initialBalance.toFixed(2)} USDT\n`;

        for (let i = 1; i <= 3; i++) {
            // '매매 없음' 체크박스 확인
            if (document.getElementById(`no-trade-${i}`).checked) {
                fileContent += `\n✅ ${i}차 매매\n· 없음\n`;
                continue; // 다음 루프로 넘어감
            }

            const coin = document.getElementById(`coin-${i}`).value;
            // 코인 이름이 없으면 해당 매매는 기록하지 않음
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