
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const MenWomen: React.FC = () => {
  // Chart state
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  // Chart data
  const series = [75, 25];

  // Chart options
  const options: ApexOptions = {
    labels: ["Men", "Woman"],
    stroke: {
      width: 0,
      show: true,
      colors: ["#ffffff"],
    },
    colors: ["#AD63F6", "#3584FC"],
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: "80%",
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    tooltip: {
      enabled: false,
    },
    legend: {
      show: true,
      fontSize: "12px",
      position: "right",
      horizontalAlign: "center",
      offsetX: -9,
      offsetY: -2,
      itemMargin: {
        horizontal: 0,
        vertical: 5,
      },
      labels: {
        colors: "#64748B",
      },
      markers: {
        size: 5,
        offsetX: -2,
        offsetY: 1.5,
        shape: "circle",
      },
      customLegendItems: ["Men: 75%", "Women: 25%"],
    },
  };

  return (
    <>
      {ChartComponent ? (
        <ChartComponent
          options={options}
          series={series}
          type="donut"
          height={80}
          width={"100%"}
        />
      ) : (
        <div>Loading chart...</div>
      )}
    </>
  );
};

export default MenWomen;
