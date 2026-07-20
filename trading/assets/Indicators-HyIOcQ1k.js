import{M as e,j as t}from"./index-ol_Yxfpa.js";var n=`//@version=6
// =============================================================
// D1 VolKit — styled to match the reference chart exactly:
//  - plain black horizontal σ bands with on-chart text labels
//  - gray daily/weekly VWAP with "d vwap" / "w vwap" text
//  - clean 2-row white info box (top center): VIX Filter / Exp Range
//  - floating "QQQ : xxx.xx" plain text  (SPY + ratio optional, off)
//  - last week's range split into eighths (0/8..8/8) projected forward
// Built for NQ. Pull VIX from CBOE:VIX.
// =============================================================
indicator("D1 VolKit", overlay = true, max_lines_count = 500, max_labels_count = 500)


// ----------------------------- INPUTS -----------------------------
grpB = "σ Bands (Expected Move)"
anchorMode  = input.string("Prior Close", "Anchor", options = ["Prior Close", "Daily Open"], group = grpB)
useManualEM = input.bool(false, "Use manual 1σ move (pts)", group = grpB)
manualEM    = input.float(455.0, "Manual 1σ move (pts)", group = grpB)
mult1       = input.float(1.0, "Inner band ×σ", group = grpB)
mult2       = input.float(2.0, "Mid band ×σ", group = grpB)
mult3       = input.float(2.5, "Outer band ×σ", group = grpB)
showInner   = input.bool(false, "Show ±1σ", group = grpB)
showAnchor  = input.bool(false, "Show anchor midline", group = grpB)
bandScale   = input.float(1.0, "Band width scale", minval = 0.1, step = 0.05, tooltip = "Scales the whole band set. Lower = bands hug price tighter. Try 0.4–0.6 on quiet days.", group = grpB)
sigLabOff   = input.int(2, "σ label offset (bars right)", group = grpB)
bandRightPad = input.int(8, "Bands extend right (bars)", minval = 0, tooltip = "How far past current price the σ lines project. Lower = tighter to price for intraday.", group = grpB)
bandColor   = input.color(color.new(color.black, 0), "Band line color", group = grpB)
bandLabColor = input.color(color.new(color.black, 0), "Band label color", group = grpB)
bandWidth   = input.int(1, "Band line width", minval = 1, maxval = 4, group = grpB)
txtUpper3   = input.string("+2.5σ", "Label: outer up (+2.5σ)", group = grpB)
txtUpper2   = input.string("+2σ", "Label: mid up (+2σ)", group = grpB)
txtUpper1   = input.string("+1σ", "Label: inner up (+1σ)", group = grpB)
txtAnchor   = input.string("anchor", "Label: anchor", group = grpB)
txtLower1   = input.string("-1σ", "Label: inner dn (-1σ)", group = grpB)
txtLower2   = input.string("-2σ", "Label: mid dn (-2σ)", group = grpB)
txtLower3   = input.string("-2.5σ", "Label: outer dn (-2.5σ)", group = grpB)

grpV = "VWAP"
showDV     = input.bool(true, "Daily VWAP", group = grpV)
showWV     = input.bool(true, "Weekly VWAP", group = grpV)
vwapLabOff = input.int(5, "VWAP label offset (bars right)", group = grpV)
dvColor    = input.color(color.new(color.gray, 0), "Daily VWAP color", group = grpV)
wvColor    = input.color(color.new(color.gray, 0), "Weekly VWAP color", group = grpV)
vwapWidth  = input.int(1, "VWAP line width", minval = 1, maxval = 4, group = grpV)
txtDVWAP   = input.string("d vwap", "Label: daily VWAP", group = grpV)
txtWVWAP   = input.string("w vwap", "Label: weekly VWAP", group = grpV)
txtMergedVWAP = input.string("w vwap / d vwap", "Label: merged VWAP", group = grpV)

grpX = "VIX Filter"
vixSym      = input.symbol("CBOE:VIX", "VIX symbol", group = grpX)
vixNormal   = input.float(20.0, "≤ this = NORMAL", group = grpX)
vixElevated = input.float(30.0, "≤ this = ELEVATED (else EXTREME)", group = grpX)

grpER = "Expected-Range Regime"
atrLen = input.int(14, "Realized ATR length (days)", group = grpER)
erExt  = input.float(1.25, "EXTREME if implied/realized ≥", group = grpER)
erQuiet= input.float(0.85, "QUIET if implied/realized ≤", group = grpER)

grpR = "Reference Prices"
showQQQ   = input.bool(true, "QQQ floating text", group = grpR)
qqqSym    = input.symbol("NASDAQ:QQQ", "QQQ symbol", group = grpR)
qqqLabOff = input.int(30, "QQQ label offset (bars right)", group = grpR)
showSPY   = input.bool(false, "SPY floating text", group = grpR)
spySym    = input.symbol("AMEX:SPY", "SPY symbol", group = grpR)
showRatio = input.bool(false, "NQ÷QQQ ratio text", group = grpR)
refAnchor = input.string("Current Price", "Anchor QQQ/SPY to", options = ["Current Price", "Daily Open"], group = grpR)
refColor  = input.color(color.new(color.black, 0), "Reference text color", group = grpR)
txtQQQ    = input.string("QQQ", "Label: QQQ prefix", group = grpR)
txtSPY    = input.string("SPY", "Label: SPY prefix", group = grpR)
txtRatio  = input.string("NQ/QQQ", "Label: ratio prefix", group = grpR)

grpT = "Info Box"
showTbl = input.bool(true, "Show VIX / Exp Range box", group = grpT)
boxPos  = input.string("Top Right", "Box position", options = ["Top Right", "Top Center", "Top Left", "Middle Right", "Middle Left", "Bottom Right", "Bottom Center", "Bottom Left"], group = grpT)
tblText   = input.color(color.new(color.black, 0), "Box text color", group = grpT)
tblBg     = input.color(color.new(color.white, 0), "Box background", group = grpT)
tblHi     = input.color(color.rgb(155, 227, 218), "Box highlight (EXTREME)", group = grpT)
tblFrame  = input.color(color.new(color.gray, 30), "Box border color", group = grpT)
txtVixRow = input.string("VIX Filter", "Label: VIX row", group = grpT)
txtErRow  = input.string("Exp Range", "Label: Exp Range row", group = grpT)

grpGold = "Tue/Wed Window Line"
showGold   = input.bool(true, "Show Tue/Wed Line", group = grpGold)
goldColor  = input.color(color.new(color.black, 0), "Line color", group = grpGold)
goldStyle  = input.string("Solid", "Line Style", options = ["Solid", "Dashed", "Dotted"], group = grpGold)
goldWidth  = input.int(1, "Line Width", minval = 1, maxval = 4, group = grpGold)
goldOffset = input.float(0.05, "Offset Above High (%)", minval = 0.0, step = 0.01, tooltip = "Percent of price to float the line above the window high (0.05 = 0.05% above).", group = grpGold)
goldExtend = input.bool(true, "Extend line right", group = grpGold)
goldTxt    = input.string("", "Label text", group = grpGold)
goldTZ     = input.string("America/New_York", "Timezone", group = grpGold)

grpE = "Last Week's Eighths"
showEighths    = input.bool(true, "Show last week's eighths", group = grpE)
showEighthsMid = input.bool(true, "Show odd eighths (1/8,3/8,5/8,7/8)", tooltip = "Off = only 0/8, 2/8, 4/8, 6/8, 8/8.", group = grpE)
eighthsColor   = input.color(color.new(color.black, 0), "Eighths line color", group = grpE)
eighthsWidth   = input.int(1, "Eighths line width", minval = 1, maxval = 4, group = grpE)
eighthsStyle   = input.string("Dotted", "Eighths line style", options = ["Solid", "Dashed", "Dotted"], group = grpE)
eighthsLabColor = input.color(color.new(color.black, 0), "Eighths label color", group = grpE)
eighthsLabOff  = input.int(2, "Eighths label offset (bars right)", tooltip = "How far past the Friday-close right edge the fraction labels sit.", group = grpE)


// --------------------------- SESSIONS -----------------------------
newDay  = ta.change(time("D")) != 0
newWeek = ta.change(time("W")) != 0

// ----------------------------- VIX --------------------------------
vix       = request.security(vixSym, timeframe.period, close)
vixRegime = vix <= vixNormal ? "NORMAL" : vix <= vixElevated ? "ELEVATED" : "EXTREME"

// ---------------------- REFERENCE PRICES --------------------------
qqqPx = request.security(qqqSym, timeframe.period, close)
spyPx = request.security(spySym, timeframe.period, close)
ratio = qqqPx > 0 ? close / qqqPx : na

// ------------------- ANCHOR + 1σ EXPECTED MOVE --------------------
prevDayClose = request.security(syminfo.tickerid, "D", close[1], lookahead = barmerge.lookahead_on)

var float anchor = na
var float vixDay = na
var float dayOpen = na
var int dayStartBar = na
if newDay
    anchor := anchorMode == "Prior Close" ? prevDayClose : open
    vixDay := vix
    dayOpen := open
    dayStartBar := bar_index

sig1 = (useManualEM ? manualEM : anchor * (vixDay / 100.0) / math.sqrt(252.0)) * bandScale

upper1 = anchor + sig1 * mult1
lower1 = anchor - sig1 * mult1
upper2 = anchor + sig1 * mult2
lower2 = anchor - sig1 * mult2
upper3 = anchor + sig1 * mult3
lower3 = anchor - sig1 * mult3

// ------------------- EXP-RANGE REGIME -----------------------------
atrD     = request.security(syminfo.tickerid, "D", ta.atr(atrLen)[1], lookahead = barmerge.lookahead_on)
erRatio  = atrD > 0 ? sig1 / atrD : na
erRegime = na(erRatio) ? "—" : erRatio >= erExt ? "EXTREME" : erRatio <= erQuiet ? "QUIET" : "NORMAL"

// ----------------------------- VWAP -------------------------------
var float dPV = 0.0
var float dV  = 0.0
if newDay
    dPV := 0.0
    dV  := 0.0
dPV += hlc3 * volume
dV  += volume
dVWAP = dV > 0 ? dPV / dV : na

var float wPV = 0.0
var float wV  = 0.0
if newWeek
    wPV := 0.0
    wV  := 0.0
wPV += hlc3 * volume
wV  += volume
wVWAP = wV > 0 ? wPV / wV : na

inCurDay  = (timenow - time("D")) < 86400000
inCurWeek = (timenow - time("W")) < 604800000
plot(showDV and inCurDay  ? dVWAP : na, "d vwap", color = dvColor, linewidth = vwapWidth, display = display.pane + display.price_scale)
plot(showWV and inCurWeek ? wVWAP : na, "w vwap", color = wvColor, linewidth = vwapWidth, display = display.pane + display.price_scale)

// ---------------- LAST WEEK'S HIGH / LOW (rolling) ----------------
// Track the running current-week high/low. On each new weekly bar roll the
// just-finished week into "last week" and re-base the current-week tracker.
// lwHigh/lwLow stay na until a full prior week of history is loaded.
var float curWkHigh = na
var float curWkLow  = na
var float lwHigh    = na
var float lwLow     = na
var int   curWkStart  = na   // bar_index of the current week's first bar (Sun open)
var int   curWkStartT = na   // bar time     of the current week's first bar (Sun open)
if newWeek
    lwHigh := curWkHigh
    lwLow  := curWkLow
    curWkHigh := high
    curWkLow  := low
    curWkStart := bar_index
    curWkStartT := time
else
    curWkHigh := na(curWkHigh) ? high : math.max(curWkHigh, high)
    curWkLow  := na(curWkLow)  ? low  : math.min(curWkLow,  low)

// ============ DRAW: σ lines + on-chart text ============
f_band(_lvl, _txt, _show, _x1, _x2) =>
    var line ln = na
    var label lb = na
    if barstate.islast
        line.delete(ln)
        label.delete(lb)
        if _show and not na(_lvl)
            ln := line.new(_x1, _lvl, _x2, _lvl, xloc = xloc.bar_index, extend = extend.none, color = bandColor, width = bandWidth)
            lb := label.new(_x2 + sigLabOff, _lvl, _txt, xloc = xloc.bar_index, style = label.style_none, textcolor = bandLabColor, size = size.small)

// Anchor the left end of the σ lines at the day's open, but never reach back
// further than the safe bar_index buffer. Drawings convert bar_index -> time
// internally, and that lookback grows all session; clamping it here is what
// actually prevents the "historical buffer's limit" error (the band levels are
// horizontal, so the left endpoint is cosmetic and this changes nothing visual).
maxBack    = 400
bandX1raw  = na(dayStartBar) ? bar_index - 50 : dayStartBar
bandX1     = math.max(bandX1raw, bar_index - maxBack)
bandX2 = bar_index + bandRightPad
f_band(upper3, txtUpper3, true, bandX1, bandX2)
f_band(upper2, txtUpper2, true, bandX1, bandX2)
f_band(upper1, txtUpper1, showInner, bandX1, bandX2)
f_band(anchor, txtAnchor, showAnchor, bandX1, bandX2)
f_band(lower1, txtLower1, showInner, bandX1, bandX2)
f_band(lower2, txtLower2, true, bandX1, bandX2)
f_band(lower3, txtLower3, true, bandX1, bandX2)

// ============ DRAW: last week's eighths ============
// Span the FULL current week: left end = Sunday open (the week's first bar),
// right end = the latest bar but capped at Friday 17:00 ET (CME NQ futures
// close). Drawn with xloc.bar_time (not bar_index) so it is immune to the
// bar_index historical-buffer limit — a full intraday week is thousands of
// bars, far past the 400-bar clamp the σ bands use, so anchoring the left end
// at Sunday on a 5m chart only works with time coordinates.
eighthsLineStyle = eighthsStyle == "Solid" ? line.style_solid : eighthsStyle == "Dashed" ? line.style_dashed : line.style_dotted

f_eighth(_lvl, _txt, _show, _t1, _t2, _tlab) =>
    var line ln = na
    var label lb = na
    if barstate.islast
        line.delete(ln)
        label.delete(lb)
        if _show and not na(_lvl)
            ln := line.new(_t1, _lvl, _t2, _lvl, xloc = xloc.bar_time, extend = extend.none, color = eighthsColor, width = eighthsWidth, style = eighthsLineStyle)
            lb := label.new(_tlab, _lvl, _txt, xloc = xloc.bar_time, style = label.style_none, textcolor = eighthsLabColor, size = size.small)

eRange = lwHigh - lwLow
e0 = lwLow
e1 = lwLow + eRange * 0.125
e2 = lwLow + eRange * 0.25
e3 = lwLow + eRange * 0.375
e4 = lwLow + eRange * 0.5
e5 = lwLow + eRange * 0.625
e6 = lwLow + eRange * 0.75
e7 = lwLow + eRange * 0.875
e8 = lwHigh

// Left end = Sunday open of the current week (the week's first bar time).
eT1 = na(curWkStartT) ? time : curWkStartT

// Friday 17:00 ET cap (CME NQ futures close). Derive Friday's calendar date by
// stepping forward day-by-day from the week start until ET weekday == Friday
// (handles month/year rollovers and the week starting on Sun *or* Mon), then
// stamp 17:00 ET on that date.
// Recompute only when the week rolls (or first time it becomes known).
var int friCloseT = na
if not na(curWkStartT) and (newWeek or na(friCloseT))
    int probe = curWkStartT
    int guard = 0
    while dayofweek(probe, "America/New_York") != dayofweek.friday and guard < 7
        probe += 86400000
        guard += 1
    fy = year(probe, "America/New_York")
    fm = month(probe, "America/New_York")
    fd = dayofmonth(probe, "America/New_York")
    friCloseT := timestamp("America/New_York", fy, fm, fd, 17, 0)

// Right end grows with the latest bar but never past Friday 17:00 ET.
eT2 = na(friCloseT) ? time : math.min(time, friCloseT)
// Labels sit a few bars of time past the right end (≈ chart timeframe spacing).
eTlab = eT2 + eighthsLabOff * timeframe.in_seconds() * 1000

showE        = showEighths and not na(lwHigh) and not na(lwLow)
showOdd      = showE and showEighthsMid
f_eighth(e8, "8/8", showE,    eT1, eT2, eTlab)
f_eighth(e7, "7/8", showOdd,  eT1, eT2, eTlab)
f_eighth(e6, "6/8", showE,    eT1, eT2, eTlab)
f_eighth(e5, "5/8", showOdd,  eT1, eT2, eTlab)
f_eighth(e4, "4/8", showE,    eT1, eT2, eTlab)
f_eighth(e3, "3/8", showOdd,  eT1, eT2, eTlab)
f_eighth(e2, "2/8", showE,    eT1, eT2, eTlab)
f_eighth(e1, "1/8", showOdd,  eT1, eT2, eTlab)
f_eighth(e0, "0/8", showE,    eT1, eT2, eTlab)

// ============ DRAW: floating plain-text labels ============
f_txt(_lvl, _txt, _show, _xoff, _col, _sz, _rightAnchor) =>
    var label lb = na
    if barstate.islast
        label.delete(lb)
        if _show and not na(_lvl)
            sty = _rightAnchor ? label.style_label_left : label.style_none
            lb := label.new(bar_index + _xoff, _lvl, _txt, xloc = xloc.bar_index, style = sty, color = color.new(color.white, 100), textcolor = _col, size = _sz)

// VWAP text on the lines (like the reference).
// On the Sunday futures open the daily and weekly VWAP start at the same value,
// so the two labels stack. While they coincide, show a single merged
// "w vwap / d vwap" label; once they diverge (Mon 6pm, new day resets daily),
// split back into the two separate labels.
vwapTol     = syminfo.mintick * 2
vwapsEqual  = not na(dVWAP) and not na(wVWAP) and math.abs(dVWAP - wVWAP) <= vwapTol
showBothVW  = showWV and inCurWeek and showDV and inCurDay
mergedVW    = showBothVW and vwapsEqual
f_txt(wVWAP, txtMergedVWAP, mergedVW, vwapLabOff, wvColor, size.small, true)
f_txt(wVWAP, txtWVWAP, showWV and inCurWeek and not mergedVW, vwapLabOff, wvColor, size.small, true)
f_txt(dVWAP, txtDVWAP, showDV and inCurDay and not mergedVW, vwapLabOff, dvColor, size.small, true)

// QQQ / SPY / ratio floating text. Pushed further right than the VWAP labels
// so the two text blocks never overlap when VWAP sits near current price.
isRefTF = timeframe.isminutes and (timeframe.multiplier == 1 or timeframe.multiplier == 5)
refLvl  = refAnchor == "Current Price" ? close : dayOpen
refTxt = ""
if showQQQ
    refTxt := txtQQQ + " : " + str.tostring(qqqPx, "#.##")
if showSPY
    refTxt := refTxt + (str.length(refTxt) > 0 ? "\\n" : "") + txtSPY + " : " + str.tostring(spyPx, "#.##")
if showRatio
    refTxt := refTxt + (str.length(refTxt) > 0 ? "\\n" : "") + txtRatio + " : " + str.tostring(ratio, "#.##") + "x"
f_txt(refLvl, refTxt, (str.length(refTxt) > 0) and isRefTF, qqqLabOff, refColor, size.small, true)

// ============ INFO BOX (top center, 2 rows) ============
boxAnchor = boxPos == "Top Right" ? position.top_right : boxPos == "Top Center" ? position.top_center : boxPos == "Top Left" ? position.top_left : boxPos == "Middle Right" ? position.middle_right : boxPos == "Middle Left" ? position.middle_left : boxPos == "Bottom Right" ? position.bottom_right : boxPos == "Bottom Center" ? position.bottom_center : position.bottom_left
var table dash = table.new(boxAnchor, 2, 2, border_width = 1, frame_color = tblFrame, frame_width = 1)
if showTbl and barstate.islast
    table.cell(dash, 0, 0, " " + txtVixRow + " ", text_color = tblText, bgcolor = tblBg, text_size = size.normal, text_halign = text.align_left)
    table.cell(dash, 1, 0, " " + str.tostring(vix, "#.##") + "  " + vixRegime + " ", text_color = tblText, bgcolor = tblBg, text_size = size.normal, text_halign = text.align_right)
    table.cell(dash, 0, 1, " " + txtErRow + " ", text_color = tblText, bgcolor = tblBg, text_size = size.normal, text_halign = text.align_left)
    erBg = erRegime == "EXTREME" ? tblHi : tblBg
    table.cell(dash, 1, 1, " " + str.tostring(sig1, "#") + " pts  " + erRegime + " ", text_color = tblText, bgcolor = erBg, text_size = size.normal, text_halign = text.align_right)

// ============ TUE -> WED WINDOW LINE ============
// One horizontal line anchored at the highest high made during the window
// (Tue 01:00 -> Wed 23:00 NY). It ratchets up as new highs print and floats a
// small percent offset above that high. The window spans a day boundary, so it
// is detected by NY weekday + hour rather than a single session string.
goldLineStyle = goldStyle == "Solid" ? line.style_solid : goldStyle == "Dashed" ? line.style_dashed : line.style_dotted

nyDow_g  = dayofweek(time, goldTZ)
nyHour_g = hour(time, goldTZ)
// In window: Tuesday from 01:00 on, OR Wednesday up to and including the 23:00 hour.
inGoldWin = (nyDow_g == dayofweek.tuesday and nyHour_g >= 1) or (nyDow_g == dayofweek.wednesday and nyHour_g <= 23)

var float goldHigh   = na
var int   goldStartX = na
var line  goldLine   = na
var label goldLabel  = na

// New window opens (off -> on): clear the old line and reset the tracked high.
if inGoldWin and not inGoldWin[1]
    line.delete(goldLine)
    label.delete(goldLabel)
    goldLine   := na
    goldLabel  := na
    goldHigh   := high
    goldStartX := bar_index

// Track the highest high through the window.
if inGoldWin
    goldHigh := na(goldHigh) ? high : math.max(goldHigh, high)

// Draw / update the line at the offset above the window high.
if showGold and inGoldWin and not na(goldHigh)
    goldLvl = goldHigh * (1 + goldOffset / 100)
    rightX  = goldExtend ? bar_index + 20 : bar_index
    if na(goldLine)
        goldLine  := line.new(goldStartX, goldLvl, rightX, goldLvl, xloc = xloc.bar_index, color = goldColor, width = goldWidth, style = goldLineStyle)
        goldLabel := label.new(rightX, goldLvl, goldTxt, xloc = xloc.bar_index, style = label.style_label_left, color = color.new(color.black, 100), textcolor = goldColor, size = size.small)
    else
        line.set_xy1(goldLine, goldStartX, goldLvl)
        line.set_xy2(goldLine, rightX, goldLvl)
        line.set_color(goldLine, goldColor)
        line.set_width(goldLine, goldWidth)
        line.set_style(goldLine, goldLineStyle)
        label.set_xy(goldLabel, rightX, goldLvl)
        label.set_text(goldLabel, goldTxt)
        label.set_textcolor(goldLabel, goldColor)

// ----------------------------- ALERTS -----------------------------
alertcondition(high >= upper2 and high[1] < upper2, "Tag +2σ",   "Price tagged +2σ")
alertcondition(low  <= lower2 and low[1]  > lower2, "Tag -2σ",   "Price tagged -2σ")
alertcondition(high >= upper3 and high[1] < upper3, "Tag +2.5σ", "Price tagged +2.5σ")
alertcondition(low  <= lower3 and low[1]  > lower3, "Tag -2.5σ", "Price tagged -2.5σ")
`,r=`//@version=6
// =============================================================
// D1 Key Levels — companion to D1 VolKit for the main MNQ chart.
// Draws the reference levels VolKit doesn't:
//  - prior session high / low / settle (+ optional midpoint)
//  - 52-week high / low
//  - up to 4 manual levels (0 = hidden)
// Same style language as VolKit: plain black horizontal lines with
// small plain-text labels, delete-and-redraw on the last bar.
// Levels compute off the chart symbol, so it tracks MNQ/NQ natively.
// =============================================================
indicator("D1 Key Levels", overlay = true, max_lines_count = 100, max_labels_count = 100)


// ----------------------------- INPUTS -----------------------------
grpP = "Prior Session"
showPDH = input.bool(true, "Prior day high", group = grpP)
showPDL = input.bool(true, "Prior day low", group = grpP)
showPDC = input.bool(true, "Prior day settle", group = grpP)
showPDM = input.bool(false, "Prior day midpoint", group = grpP)
pdStyle = input.string("Solid", "Line style", options = ["Solid", "Dashed", "Dotted"], group = grpP)
txtPDH  = input.string("pd high", "Label: prior day high", group = grpP)
txtPDL  = input.string("pd low", "Label: prior day low", group = grpP)
txtPDC  = input.string("pd settle", "Label: prior day settle", group = grpP)
txtPDM  = input.string("pd mid", "Label: prior day mid", group = grpP)

grp52 = "52-Week Range"
show52H = input.bool(true, "52w high", group = grp52)
show52L = input.bool(true, "52w low", group = grp52)
w52Style = input.string("Dashed", "Line style", options = ["Solid", "Dashed", "Dotted"], group = grp52)
txt52H  = input.string("52w high", "Label: 52w high", group = grp52)
txt52L  = input.string("52w low", "Label: 52w low", group = grp52)

grpM = "Manual Levels"
mLvl1 = input.float(0.0, "Level 1 price", tooltip = "0 = hidden. Type any price to pin it on the chart.", group = grpM)
mTxt1 = input.string("L1", "Level 1 label", group = grpM)
mLvl2 = input.float(0.0, "Level 2 price", group = grpM)
mTxt2 = input.string("L2", "Level 2 label", group = grpM)
mLvl3 = input.float(0.0, "Level 3 price", group = grpM)
mTxt3 = input.string("L3", "Level 3 label", group = grpM)
mLvl4 = input.float(0.0, "Level 4 price", group = grpM)
mTxt4 = input.string("L4", "Level 4 label", group = grpM)
mStyle = input.string("Dotted", "Line style", options = ["Solid", "Dashed", "Dotted"], group = grpM)

grpS = "Style"
showPx    = input.bool(true, "Show price in labels", group = grpS)
lvlColor  = input.color(color.new(color.black, 0), "Line color", group = grpS)
lvlLabColor = input.color(color.new(color.black, 0), "Label color", group = grpS)
lvlWidth  = input.int(1, "Line width", minval = 1, maxval = 4, group = grpS)
lvlLabOff = input.int(2, "Label offset (bars right)", group = grpS)
lvlRightPad = input.int(8, "Lines extend right (bars)", minval = 0, tooltip = "How far past current price the level lines project.", group = grpS)


// --------------------------- SESSIONS -----------------------------
newDay = ta.change(time("D")) != 0

var int dayStartBar = na
if newDay
    dayStartBar := bar_index

// ------------------------ LEVEL FETCHES ---------------------------
// [1] values are historical, so lookahead_on is safe (VolKit rule).
pdHigh   = request.security(syminfo.tickerid, "D", high[1], lookahead = barmerge.lookahead_on)
pdLow    = request.security(syminfo.tickerid, "D", low[1], lookahead = barmerge.lookahead_on)
pdSettle = request.security(syminfo.tickerid, "D", close[1], lookahead = barmerge.lookahead_on)
pdMid    = (pdHigh + pdLow) / 2.0

// 52 trading weeks ≈ 252 daily bars, ended at the prior daily bar.
w52High = request.security(syminfo.tickerid, "D", ta.highest(high, 252)[1], lookahead = barmerge.lookahead_on)
w52Low  = request.security(syminfo.tickerid, "D", ta.lowest(low, 252)[1], lookahead = barmerge.lookahead_on)

// ============ DRAW: level lines + on-chart text ============
f_style(_s) =>
    _s == "Solid" ? line.style_solid : _s == "Dashed" ? line.style_dashed : line.style_dotted

f_lab(_txt, _lvl) =>
    showPx and not na(_lvl) ? _txt + "  " + str.tostring(_lvl, format.mintick) : _txt

f_lvl(_lvl, _txt, _show, _x1, _x2, _style) =>
    var line ln = na
    var label lb = na
    if barstate.islast
        line.delete(ln)
        label.delete(lb)
        if _show and not na(_lvl)
            ln := line.new(_x1, _lvl, _x2, _lvl, xloc = xloc.bar_index, extend = extend.none, color = lvlColor, width = lvlWidth, style = f_style(_style))
            lb := label.new(_x2 + lvlLabOff, _lvl, f_lab(_txt, _lvl), xloc = xloc.bar_index, style = label.style_none, textcolor = lvlLabColor, size = size.small)

// Same left-edge clamp as VolKit's σ bands: bar_index drawings convert to time
// internally and error out past the historical buffer, so never reach back
// more than 400 bars (the levels are horizontal; the left end is cosmetic).
maxBack   = 400
lvlX1raw  = na(dayStartBar) ? bar_index - 50 : dayStartBar
lvlX1     = math.max(lvlX1raw, bar_index - maxBack)
lvlX2     = bar_index + lvlRightPad

f_lvl(pdHigh,   txtPDH, showPDH, lvlX1, lvlX2, pdStyle)
f_lvl(pdLow,    txtPDL, showPDL, lvlX1, lvlX2, pdStyle)
f_lvl(pdSettle, txtPDC, showPDC, lvlX1, lvlX2, pdStyle)
f_lvl(pdMid,    txtPDM, showPDM, lvlX1, lvlX2, pdStyle)
f_lvl(w52High,  txt52H, show52H, lvlX1, lvlX2, w52Style)
f_lvl(w52Low,   txt52L, show52L, lvlX1, lvlX2, w52Style)
f_lvl(mLvl1 > 0 ? mLvl1 : na, mTxt1, mLvl1 > 0, lvlX1, lvlX2, mStyle)
f_lvl(mLvl2 > 0 ? mLvl2 : na, mTxt2, mLvl2 > 0, lvlX1, lvlX2, mStyle)
f_lvl(mLvl3 > 0 ? mLvl3 : na, mTxt3, mLvl3 > 0, lvlX1, lvlX2, mStyle)
f_lvl(mLvl4 > 0 ? mLvl4 : na, mTxt4, mLvl4 > 0, lvlX1, lvlX2, mStyle)

// ----------------------------- ALERTS -----------------------------
alertcondition(high >= pdHigh and high[1] < pdHigh, "Break pd high", "Price broke prior day high")
alertcondition(low  <= pdLow  and low[1]  > pdLow,  "Break pd low",  "Price broke prior day low")
alertcondition(high >= pdSettle and high[1] < pdSettle, "Reclaim pd settle", "Price reclaimed prior day settle")
`,i=e(),a=[{name:`D1 VolKit`,source:n,blurb:`The NQ session chart. σ expected-move bands, daily and weekly VWAP, a VIX and expected-range readout, and last week’s range split into eighths.`},{name:`D1 Key Levels`,source:r,blurb:`The companion overlay. Prior session high, low, and settle, 52-week extremes, and up to four levels you mark yourself.`}];async function o(e){try{await navigator.clipboard.writeText(e.source),t(`${e.name} copied. Paste it into the Pine editor.`)}catch{t(`Could not reach the clipboard. Try the copy again.`)}}function s(){return(0,i.jsxs)(`div`,{className:`settings`,children:[(0,i.jsx)(`h2`,{children:`Indicators`}),(0,i.jsxs)(`section`,{className:`stat-section first`,children:[(0,i.jsx)(`h3`,{children:`On your chart`}),(0,i.jsx)(`p`,{className:`on-canvas-note`,children:`The TradingView indicators built for this desk, written in Pine v6 and included with D1. Copy one below, then in TradingView open the Pine editor, paste, and press Add to chart.`})]}),a.map(e=>(0,i.jsxs)(`section`,{className:`stat-section`,children:[(0,i.jsx)(`h3`,{children:e.name}),(0,i.jsx)(`p`,{className:`on-canvas-note`,children:e.blurb}),(0,i.jsx)(`button`,{type:`button`,className:`ghost`,onClick:()=>o(e),children:`Copy the source`})]},e.name))]})}export{s as default};