package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class RoutesAndRunErrorsTest {
    @Test
    void segmentsArePercentEncodedWithSpacesAsPercent20() {
        assertEquals("/api/projects/my%20app%2Fx/roster/dev%3F1", Routes.projectRosterItem("my app/x", "dev?1"));
        assertEquals("/api/conversations?agentId=a%26b&instanceId=c%3Dd", Routes.conversationsOf("a&b", "c=d"));
        assertEquals("/api/projects/p/reviews/42", Routes.projectReview("p", 42));
    }

    @Test
    void aTemplateTakesExactlyItsValues() {
        assertThrows(IllegalArgumentException.class, () -> Routes.fill("/a/{x}", "1", "2"));
        assertThrows(IllegalArgumentException.class, () -> Routes.fill("/a/{x}/{y}", "1"));
    }

    @Test
    void runErrorsReadAsTheWebTitlesThem() {
        assertEquals("Sign-in required", RunErrors.title("auth_expired"));
        assertEquals("Run error", RunErrors.title(null));
        assertEquals("Run error", RunErrors.title(""));
        assertEquals("brand new code", RunErrors.title("brand_new_code"));
    }
}
