package dev.agentoffice.mc.core;

import java.io.IOException;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Work off the caller's thread, its outcome handed back on another (the game's main thread). */
public final class Async {
    public interface Io<T> {
        T run() throws IOException;
    }

    private Async() {}

    /**
     * Runs {@code work} on {@code io}; its result goes to {@code ok}, any failure to {@code failed}, both on
     * {@code main} and only while {@code alive} holds. Every failure arrives, a malformed reply, a bug or an Error as
     * much as a dropped connection: whoever waits on a call is always told.
     */
    public static <T> void run(Executor io, Executor main, BooleanSupplier alive, Io<T> work, Consumer<T> ok, Consumer<Exception> failed) {
        io.execute(() -> {
            T result;
            try {
                result = work.run();
            } catch (Throwable t) {
                Exception e = t instanceof Exception x ? x : new ExecutionException(t);
                if (t instanceof Error) Ids.LOG.error("Agent Office call failed", t);
                else if (!(unwrap(e) instanceof IOException)) Ids.LOG.warn("Agent Office call failed", e);
                main.execute(() -> {
                    if (alive.getAsBoolean()) failed.accept(e);
                });
                return;
            }
            main.execute(() -> {
                if (alive.getAsBoolean()) ok.accept(result);
            });
        });
    }

    /** What a person should read about a failure: the first message found from the outside in, else the root's type. */
    public static String message(Throwable e) {
        Throwable t = unwrap(e);
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c.getMessage() != null && !c.getMessage().isBlank()) return c.getMessage();
            if (c.getCause() == null) return c.getClass().getSimpleName();
        }
        return t.getClass().getSimpleName();
    }

    /** Through future wrappers, and the IllegalStateException a future's supplier uses to carry an IOException. */
    static Throwable unwrap(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && (t instanceof CompletionException || t instanceof ExecutionException
                || t instanceof IllegalStateException && t.getCause() instanceof IOException)) {
            t = t.getCause();
        }
        return t;
    }
}
