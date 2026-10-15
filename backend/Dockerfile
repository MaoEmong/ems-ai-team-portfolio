FROM gradle:8.14.3-jdk21 AS build
WORKDIR /app
COPY build.gradle settings.gradle ./
COPY src ./src
RUN gradle --no-daemon bootJar
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system ems && useradd --system --gid ems ems
COPY --from=build /app/build/libs/ems-backend-0.1.0.jar app.jar
USER ems
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
