name := """play-slick-quickstart"""

version := "1.0-SNAPSHOT"

scalaVersion := "2.11.1"

libraryDependencies ++= Seq(
ws,
  "org.webjars" %% "webjars-play" % "2.3.0",
  "com.typesafe.slick" %% "slick" % "2.1.0",
"com.typesafe.play" %% "play-slick" % "0.8.0"
)

fork in Test := false


lazy val root = (project in file(".")).enablePlugins(PlayScala, SbtWeb)