package entity

import (
	"reflect"
	"testing"
)

func TestJSONRoundTrip(t *testing.T) {
	tags := []string{"사도", "마법사"}
	s, err := marshalJSON(tags)
	if err != nil {
		t.Fatal(err)
	}
	var back []string
	if err := unmarshalJSON(s, &back); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(tags, back) {
		t.Fatalf("round-trip mismatch: %v", back)
	}
}

func TestUnmarshalEmptyIsNoop(t *testing.T) {
	var v []string
	if err := unmarshalJSON("", &v); err != nil {
		t.Fatalf("empty should be no-op, got %v", err)
	}
	if v != nil {
		t.Fatalf("want nil, got %v", v)
	}
}
