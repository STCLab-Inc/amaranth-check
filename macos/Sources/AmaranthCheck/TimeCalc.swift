import Foundation

// MARK: - Work Time Calculation

struct WorkStatus {
    let come: String
    let effectiveStart: Int   // minutes from midnight
    let requiredMin: Int      // 540 - leaveMinutes
    let leaveEst: String      // estimated leave time HH:MM
    let leave: String?        // actual leave time
    let leaveMinutes: Int?    // 시간연차 minutes
    let remain: Int           // minutes remaining (negative = overtime)
    let elapsed: Int
    let pct: Int              // 0-100 progress
    let overtime: Int?        // nil if not overtime

    var isDone: Bool { leave != nil || remain <= 0 }
}

func calculateWorkStatus(cache: AttendanceCache, now: Date = Date()) -> WorkStatus? {
    guard let come = cache.come, let comeMin = parseTime(come) else { return nil }

    let effectiveStart = max(comeMin, 480)  // 8AM floor
    let requiredMin = 540 - (cache.leaveMinutes ?? 0)
    let leaveMin = effectiveStart + requiredMin
    let leaveEst = formatMinutes(leaveMin)

    let cal = Calendar.current
    let nowMin = cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now)
    let remain = leaveMin - nowMin
    let elapsed = nowMin - effectiveStart
    let pct = requiredMin > 0 ? min(100, max(0, elapsed * 100 / requiredMin)) : 100

    return WorkStatus(
        come: come,
        effectiveStart: effectiveStart,
        requiredMin: requiredMin,
        leaveEst: leaveEst,
        leave: cache.leave?.isEmpty == false ? cache.leave : nil,
        leaveMinutes: cache.leaveMinutes,
        remain: remain,
        elapsed: elapsed,
        pct: pct,
        overtime: remain < 0 ? -remain : nil
    )
}
