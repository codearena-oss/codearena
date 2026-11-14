func rejectedMessages(times []int, limit int, window int) []int {
	var rejected []int
	var windowTimes []int

	for i, t := range times {
		// Remove timestamps outside the window
		valid := []int{}
		for _, wt := range windowTimes {
			if t - wt < window {
				valid = append(valid, wt)
			}
		}
		windowTimes = valid

		if len(windowTimes) >= limit {
			rejected = append(rejected, i)
		} else {
			windowTimes = append(windowTimes, t)
		}
	}
	if rejected == nil {
		return []int{}
	}
	return rejected
}