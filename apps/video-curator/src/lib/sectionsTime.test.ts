import { describe, expect, it } from 'vitest'
import { computeSectionTimeRanges } from './sectionsTime'
import type { Section } from './store'

function section(id: number, cues: Array<[number, number]>, isEnabled = true): Section {
  return {
    id,
    title: `Section ${id}`,
    description: '',
    color: '#000',
    isEnabled,
    items: cues.map(([startTime, endTime], i) => ({ index: i, startTime, endTime, text: '' })),
  }
}

describe('computeSectionTimeRanges', () => {
  it('pads the first section to 0 and the last to the video duration', () => {
    const ranges = computeSectionTimeRanges(
      [section(1, [[5, 10], [10, 20]]), section(2, [[20, 30]])],
      40
    )
    expect(ranges).toEqual([
      { sectionId: 1, isEnabled: true, start: 0, end: 20 },
      { sectionId: 2, isEnabled: true, start: 20, end: 40 },
    ])
  })

  it('uses the last cue end when the video duration is unknown', () => {
    const ranges = computeSectionTimeRanges([section(1, [[5, 10]]), section(2, [[12, 18]])], NaN)
    expect(ranges.at(-1)).toMatchObject({ start: 12, end: 18 })
  })

  it('skips sections without valid cues', () => {
    const ranges = computeSectionTimeRanges(
      [section(1, [[0, 10]]), section(2, []), section(3, [[20, 30]])],
      30
    )
    expect(ranges.map((r) => r.sectionId)).toEqual([1, 3])
  })

  it('keeps the enabled flag', () => {
    const ranges = computeSectionTimeRanges([section(1, [[0, 10]], false)], 10)
    expect(ranges[0].isEnabled).toBe(false)
  })
})
