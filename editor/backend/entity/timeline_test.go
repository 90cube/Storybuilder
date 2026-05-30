package entity

import "testing"

func TestTimelineAccumulatesSorted(t *testing.T) {
	db := newTestDB(t, testRegistry())
	// 일부러 역순으로 추가
	if err := AddTimelineEntry(db, TimelineEntry{EntityID: "kalix", OrderKey: 985, Era: "아라드력 985년", State: "전이 목격"}); err != nil {
		t.Fatal(err)
	}
	if err := AddTimelineEntry(db, TimelineEntry{EntityID: "kalix", OrderKey: 977, Era: "아라드력 977년", State: "비명굴 각성", Traits: []string{"성장"}}); err != nil {
		t.Fatal(err)
	}
	if err := AddTimelineEntry(db, TimelineEntry{EntityID: "other", OrderKey: 100, State: "무관"}); err != nil {
		t.Fatal(err)
	}

	tl, err := ListTimeline(db, "kalix")
	if err != nil {
		t.Fatal(err)
	}
	if len(tl) != 2 {
		t.Fatalf("want 2 kalix entries, got %d", len(tl))
	}
	// order_key 오름차순
	if tl[0].OrderKey != 977 || tl[1].OrderKey != 985 {
		t.Fatalf("not sorted: %d, %d", tl[0].OrderKey, tl[1].OrderKey)
	}
	if len(tl[0].Traits) != 1 || tl[0].Traits[0] != "성장" {
		t.Fatalf("traits round-trip failed: %+v", tl[0].Traits)
	}
}
