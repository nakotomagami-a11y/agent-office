package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

class JsonTest {
    private static final JsonObject O = JsonParser.parseString("""
            {"s":"x","empty":"","nil":null,"n":42,"big":5000000000,"ns":"7","t":true,"ts":"true","f":false,"one":1,"obj":{}}""")
            .getAsJsonObject();

    @Test
    void absentAndNullReadAlike() {
        for (String key : new String[] {"nil", "missing"}) {
            assertNull(Json.str(O, key));
            assertEquals("", Json.text(O, key));
            assertEquals(0, Json.num(O, key));
            assertEquals(0, Json.intNum(O, key));
            assertNull(Json.intOrNull(O, key));
            assertFalse(Json.bool(O, key));
            assertFalse(Json.isString(O, key));
        }
    }

    @Test
    void valuesReadAsTheServerSendsThem() {
        assertEquals("x", Json.str(O, "s"));
        assertEquals("x", Json.text(O, "s"));
        assertEquals("", Json.str(O, "empty"));
        assertEquals("42", Json.str(O, "n"), "a number reads as its text");
        assertEquals(42, Json.num(O, "n"));
        assertEquals(5_000_000_000L, Json.num(O, "big"));
        assertEquals(7, Json.intNum(O, "ns"), "a numeric string reads as its number");
        assertEquals(Integer.valueOf(42), Json.intOrNull(O, "n"));
        assertTrue(Json.isString(O, "s"));
        assertFalse(Json.isString(O, "n"));
    }

    @Test
    void onlyTrueIsTrue() {
        assertTrue(Json.bool(O, "t"));
        assertTrue(Json.bool(O, "ts"));
        assertFalse(Json.bool(O, "f"));
        assertFalse(Json.bool(O, "one"));
        assertFalse(Json.bool(O, "obj"));
    }

    @Test
    void aWrongTypeStillThrows() {
        // AgentOfficeClient turns these into IOException("bad_response: ...").
        assertThrows(RuntimeException.class, () -> Json.str(O, "obj"));
        assertThrows(RuntimeException.class, () -> Json.num(O, "s"));
    }
}
